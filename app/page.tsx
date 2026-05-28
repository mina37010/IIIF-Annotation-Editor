"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addAnnotationToCanvas,
  deleteAnnotation,
  getCanvasImage,
  parseXywh,
  Rect,
  updateAnnotation,
} from "@/lib/iiif";

export default function Home() {
  const [manifestText, setManifestText] = useState("");
  const [manifest, setManifest] = useState<any | null>(null);
  const [selectedCanvasIndex, setSelectedCanvasIndex] = useState(0);
  const [cutNumber, setCutNumber] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(
    null
  );

  const canvases = useMemo(() => {
    return Array.isArray(manifest?.items) ? manifest.items : [];
  }, [manifest]);

  const selectedCanvas = canvases[selectedCanvasIndex] ?? null;
  const imageUrl = selectedCanvas ? getCanvasImage(selectedCanvas) : null;

  const existingAnnotations = useMemo(() => {
    return selectedCanvas?.annotations?.flatMap((p: any) => p.items ?? []) ?? [];
  }, [selectedCanvas]);

  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    if (imageUrl) {
      setImageLoading(true);
    }
  }, [imageUrl]);

  function resetEditingState() {
    setRect(null);
    setDragStart(null);
    setEditingAnnotationId(null);
    setCutNumber("");
  }

  function loadManifest() {
    try {
      const parsed = JSON.parse(manifestText);

      if (parsed.type !== "Manifest") {
        alert("type が Manifest ではありません。");
        return;
      }

      if (!Array.isArray(parsed.items)) {
        alert("manifest.items が配列ではありません。IIIF Manifestを確認してください。");
        return;
      }

      setManifest(parsed);
      setSelectedCanvasIndex(0);
      resetEditingState();
    } catch {
      alert("manifest.json のJSON形式が不正です。");
    }
  }

  function goPrevCanvas() {
    if (canvases.length === 0) return;
    setSelectedCanvasIndex((i) => Math.max(0, i - 1));
    resetEditingState();
  }

  function goNextCanvas() {
    if (canvases.length === 0) return;
    setSelectedCanvasIndex((i) => Math.min(canvases.length - 1, i + 1));
    resetEditingState();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (canvases.length === 0) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }

      if (e.key === "ArrowLeft") goPrevCanvas();
      if (e.key === "ArrowRight") goNextCanvas();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canvases.length]);

  function getImagePoint(e: React.MouseEvent<HTMLDivElement>) {
    if (!selectedCanvas) return null;

    const el = e.currentTarget;
    const bounds = el.getBoundingClientRect();

    const displayX = e.clientX - bounds.left;
    const displayY = e.clientY - bounds.top;

    const scaleX = selectedCanvas.width / bounds.width;
    const scaleY = selectedCanvas.height / bounds.height;

    return {
      x: displayX * scaleX,
      y: displayY * scaleY,
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!selectedCanvas) return;

    const p = getImagePoint(e);
    if (!p) return;

    setDragStart(p);
    setRect({ x: p.x, y: p.y, width: 0, height: 0 });
  }

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragStart || !selectedCanvas) return;

    const p = getImagePoint(e);
    if (!p) return;

    setRect({
      x: Math.min(dragStart.x, p.x),
      y: Math.min(dragStart.y, p.y),
      width: Math.abs(p.x - dragStart.x),
      height: Math.abs(p.y - dragStart.y),
    });
  }

  function onMouseUp() {
    setDragStart(null);
  }

  function saveAnnotation() {
    if (!manifest || !rect || !cutNumber.trim()) {
      alert("矩形とカット番号が必要です。");
      return;
    }

    const updated = editingAnnotationId
      ? updateAnnotation(
          manifest,
          selectedCanvasIndex,
          editingAnnotationId,
          cutNumber.trim(),
          rect
        )
      : addAnnotationToCanvas(
          manifest,
          selectedCanvasIndex,
          cutNumber.trim(),
          rect
        );

    setManifest(updated);
    setManifestText(JSON.stringify(updated, null, 2));
    resetEditingState();
  }

  function removeAnnotation(annotationId: string) {
    if (!manifest) return;

    const updated = deleteAnnotation(manifest, selectedCanvasIndex, annotationId);
    setManifest(updated);
    setManifestText(JSON.stringify(updated, null, 2));
    resetEditingState();
  }

  function downloadManifest() {
    if (!manifest) return;

    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "manifest.annotated.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen p-6 bg-gray-50">
      <h1 className="text-2xl font-bold mb-4">
        IIIF Annotation Editor
      </h1>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border rounded p-4">
          <h2 className="font-bold mb-2">1. Manifest JSON</h2>

          <textarea
            className="w-full h-80 border rounded p-2 font-mono text-sm"
            value={manifestText}
            onChange={(e) => setManifestText(e.target.value)}
            placeholder="manifest.json の中身を貼り付け"
          />

          <div className="flex gap-2 mt-3">
            <button
              className="px-4 py-2 bg-black text-white rounded"
              onClick={loadManifest}
            >
              読み込む
            </button>

            <button
              className="px-4 py-2 bg-blue-700 text-white rounded disabled:opacity-40"
              onClick={downloadManifest}
              disabled={!manifest}
            >
              manifestを書き出す
            </button>
          </div>
          <div className="mt-4">
            <h3 className="font-bold mb-2">Annotation一覧</h3>

            {existingAnnotations.length === 0 && (
              <p className="text-sm text-gray-500">
                まだannotationはありません。
              </p>
            )}

            <div className="space-y-2">
              {existingAnnotations.map((anno: any) => {
                const r = parseXywh(String(anno.target));
                const label =
                  anno.body?.value ??
                  anno.body?.cutNumber ??
                  anno.body?.source?.id ??
                  "(no label)";

                return (
                  <div
                    key={anno.id}
                    className="border rounded p-2 text-sm bg-gray-50"
                  >
                    <div className="font-mono">{String(label)}</div>
                    <div className="text-gray-500 break-all">{anno.target}</div>

                    <div className="flex gap-2 mt-2">
                      <button
                        className="px-3 py-1 border rounded"
                        onClick={() => {
                          if (!r) return;
                          setEditingAnnotationId(anno.id);
                          setCutNumber(String(label));
                          setRect(r);
                        }}
                      >
                        修正
                      </button>

                      <button
                        className="px-3 py-1 border rounded text-red-700"
                        onClick={() => removeAnnotation(anno.id)}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white border rounded p-4">
          <h2 className="font-bold mb-2">2. Annotation作成</h2>

          {canvases.length > 0 && (
            <div className="flex gap-2 mb-4">
              <button
                className="px-3 py-2 border rounded disabled:opacity-40"
                onClick={goPrevCanvas}
                disabled={selectedCanvasIndex === 0}
              >
                ← 前ページ
              </button>

              <select
                className="flex-1 border rounded p-2"
                value={selectedCanvasIndex}
                onChange={(e) => {
                  setSelectedCanvasIndex(Number(e.target.value));
                  resetEditingState();
                }}
              >
                {canvases.map((canvas: any, i: number) => (
                  <option key={canvas.id ?? i} value={i}>
                    {i + 1}:{" "}
                    {canvas.label?.ja?.[0] ??
                      canvas.label?.en?.[0] ??
                      canvas.label?.none?.[0] ??
                      canvas.id ??
                      "Canvas"}
                  </option>
                ))}
              </select>

              <button
                className="px-3 py-2 border rounded disabled:opacity-40"
                onClick={goNextCanvas}
                disabled={selectedCanvasIndex === canvases.length - 1}
              >
                次ページ →
              </button>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <input
              className="border rounded p-2 flex-1"
              value={cutNumber}
              onChange={(e) => setCutNumber(e.target.value)}
              placeholder="内容記述"
            />

            <button
              className="px-4 py-2 bg-green-700 text-white rounded disabled:opacity-40"
              onClick={saveAnnotation}
              disabled={!rect || !cutNumber.trim()}
            >
              {editingAnnotationId ? "annotation更新" : "annotation追加"}
            </button>
          </div>

          {imageUrl && selectedCanvas ? (
            <div
              className="relative border bg-gray-100 select-none"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
            >
              {imageLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm font-bold">
                  読み込み中
                </div>
              )}
              <img
                src={imageUrl}
                alt=""
                className="w-full block pointer-events-none"
                onLoad={() => setImageLoading(false)}
                onError={() => setImageLoading(false)}
              />

              {existingAnnotations.map((anno: any) => {
                const r = parseXywh(String(anno.target));
                if (!r) return null;

                const label =
                  anno.body?.value ??
                  anno.body?.cutNumber ??
                  anno.body?.source?.id ??
                  "";

                return (
                  <div
                    key={anno.id}
                    className="absolute border-2 border-blue-600 bg-blue-500/20"
                    style={{
                      left: `${(r.x / selectedCanvas.width) * 100}%`,
                      top: `${(r.y / selectedCanvas.height) * 100}%`,
                      width: `${(r.width / selectedCanvas.width) * 100}%`,
                      height: `${(r.height / selectedCanvas.height) * 100}%`,
                    }}
                    title={String(label)}
                  />
                );
              })}

              {rect && (
                <div
                  className="absolute border-2 border-red-600 bg-red-500/20"
                  style={{
                    left: `${(rect.x / selectedCanvas.width) * 100}%`,
                    top: `${(rect.y / selectedCanvas.height) * 100}%`,
                    width: `${(rect.width / selectedCanvas.width) * 100}%`,
                    height: `${(rect.height / selectedCanvas.height) * 100}%`,
                  }}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              manifestを読み込むと画像が表示されます。
            </p>
          )}
        </div>
      </section>
    </main>
  );
}