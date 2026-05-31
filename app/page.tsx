"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addAnnotationToCanvas,
  deleteAnnotation,
  getCanvasImage,
  parseXywh,
  Rect,
  updateAnnotation,
} from "@/lib/iiif";

type ViewerMode = "pan" | "draw";

type ViewTransform = {
  x: number;
  y: number;
  scale: number;
};

type PointerPosition = {
  clientX: number;
  clientY: number;
};

export default function Home() {
  const [manifestUrl, setManifestUrl] = useState("");
  const [manifestText, setManifestText] = useState("");
  const [manifest, setManifest] = useState<any | null>(null);
  const [selectedCanvasIndex, setSelectedCanvasIndex] = useState(0);
  const [cutNumber, setCutNumber] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(
    null
  );
  const [viewerMode, setViewerMode] = useState<ViewerMode>("pan");
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const [dragAction, setDragAction] = useState<
    | {
        type: "pan";
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startView: ViewTransform;
      }
    | {
        type: "draw";
        pointerId: number;
        startPoint: { x: number; y: number };
      }
    | {
        type: "pinch";
        pointerIds: [number, number];
        startDistance: number;
        startImageX: number;
        startImageY: number;
        startView: ViewTransform;
      }
    | null
  >(null);
  const [manifestUrlLoading, setManifestUrlLoading] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activePointersRef = useRef<Map<number, PointerPosition>>(new Map());

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
    setEditingAnnotationId(null);
    setCutNumber("");
    setDragAction(null);
    activePointersRef.current.clear();
  }

  function applyManifest(parsed: any) {
    if (parsed.type !== "Manifest") {
      alert("type が Manifest ではありません。");
      return false;
    }

    if (!Array.isArray(parsed.items)) {
      alert("manifest.items が配列ではありません。IIIF Manifestを確認してください。");
      return false;
    }

    setManifest(parsed);
    setManifestText(JSON.stringify(parsed, null, 2));
    setSelectedCanvasIndex(0);
    resetEditingState();
    return true;
  }

  function getFitView(): ViewTransform | null {
    if (!selectedCanvas || !viewportRef.current) return null;

    const bounds = viewportRef.current.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;

    const scale = Math.min(
      bounds.width / selectedCanvas.width,
      bounds.height / selectedCanvas.height
    );

    return {
      x: (bounds.width - selectedCanvas.width * scale) / 2,
      y: (bounds.height - selectedCanvas.height * scale) / 2,
      scale,
    };
  }

  function resetView() {
    const fitView = getFitView();
    if (fitView) setView(fitView);
  }

  function clampView(next: ViewTransform): ViewTransform {
    if (!selectedCanvas || !viewportRef.current) return next;

    const bounds = viewportRef.current.getBoundingClientRect();
    const imageWidth = selectedCanvas.width * next.scale;
    const imageHeight = selectedCanvas.height * next.scale;

    return {
      ...next,
      x:
        imageWidth <= bounds.width
          ? (bounds.width - imageWidth) / 2
          : Math.min(0, Math.max(bounds.width - imageWidth, next.x)),
      y:
        imageHeight <= bounds.height
          ? (bounds.height - imageHeight) / 2
          : Math.min(0, Math.max(bounds.height - imageHeight, next.y)),
    };
  }

  function getScaleBounds() {
    const fitView = getFitView();

    return {
      minScale: (fitView?.scale ?? 0.1) * 0.5,
      maxScale: (fitView?.scale ?? 1) * 24,
    };
  }

  function getPointerDistance(
    first: PointerPosition,
    second: PointerPosition
  ) {
    return Math.hypot(
      second.clientX - first.clientX,
      second.clientY - first.clientY
    );
  }

  function getPointerCenter(first: PointerPosition, second: PointerPosition) {
    return {
      clientX: (first.clientX + second.clientX) / 2,
      clientY: (first.clientY + second.clientY) / 2,
    };
  }

  useEffect(() => {
    if (!imageUrl || !selectedCanvas) return;

    const id = window.requestAnimationFrame(resetView);
    return () => window.cancelAnimationFrame(id);
  }, [imageUrl, selectedCanvas]);

  useEffect(() => {
    function onResize() {
      resetView();
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [selectedCanvas]);

  function loadManifest() {
    try {
      const parsed = JSON.parse(manifestText);
      applyManifest(parsed);
    } catch {
      alert("manifest.json のJSON形式が不正です。");
    }
  }

  async function loadManifestFromUrl() {
    const url = manifestUrl.trim();
    if (!url) {
      alert("manifest URLを入力してください。");
      return;
    }

    setManifestUrlLoading(true);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        alert(`manifest URLの読み込みに失敗しました。HTTP ${response.status}`);
        return;
      }

      const parsed = await response.json();
      applyManifest(parsed);
    } catch {
      alert(
        "manifest URLの読み込みに失敗しました。URLまたはCORS設定を確認してください。"
      );
    } finally {
      setManifestUrlLoading(false);
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

  function getImagePoint(e: React.PointerEvent<HTMLDivElement>) {
    if (!selectedCanvas) return null;

    const bounds = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - bounds.left - view.x) / view.scale;
    const y = (e.clientY - bounds.top - view.y) / view.scale;

    return {
      x: Math.min(selectedCanvas.width, Math.max(0, x)),
      y: Math.min(selectedCanvas.height, Math.max(0, y)),
    };
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!selectedCanvas) return;
    e.preventDefault();

    if (viewerMode === "draw") {
      return;
    }

    const { minScale, maxScale } = getScaleBounds();
    const zoomFactor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const nextScale = Math.min(
      maxScale,
      Math.max(minScale, view.scale * zoomFactor)
    );
    const bounds = e.currentTarget.getBoundingClientRect();
    const pointerX = e.clientX - bounds.left;
    const pointerY = e.clientY - bounds.top;
    const imageX = (pointerX - view.x) / view.scale;
    const imageY = (pointerY - view.y) / view.scale;

    setView(
      clampView({
        scale: nextScale,
        x: pointerX - imageX * nextScale,
        y: pointerY - imageY * nextScale,
      })
    );
  }

  function zoomBy(multiplier: number) {
    if (!selectedCanvas || !viewportRef.current) return;

    const bounds = viewportRef.current.getBoundingClientRect();
    const { minScale, maxScale } = getScaleBounds();
    const nextScale = Math.min(
      maxScale,
      Math.max(minScale, view.scale * multiplier)
    );
    const pointerX = bounds.width / 2;
    const pointerY = bounds.height / 2;
    const imageX = (pointerX - view.x) / view.scale;
    const imageY = (pointerY - view.y) / view.scale;

    setView(
      clampView({
        scale: nextScale,
        x: pointerX - imageX * nextScale,
        y: pointerY - imageY * nextScale,
      })
    );
  }

  function getZoomPercent() {
    const fitView = getFitView();
    if (!fitView) return 100;
    return Math.round((view.scale / fitView.scale) * 100);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!selectedCanvas) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
    });

    if (viewerMode === "pan") {
      const pointers = Array.from(activePointersRef.current.entries());
      if (e.pointerType === "touch" && pointers.length >= 2) {
        const [first, second] = pointers.slice(-2);
        const startCenter = getPointerCenter(first[1], second[1]);
        const bounds = e.currentTarget.getBoundingClientRect();

        setDragAction({
          type: "pinch",
          pointerIds: [first[0], second[0]],
          startDistance: getPointerDistance(first[1], second[1]),
          startImageX: (startCenter.clientX - bounds.left - view.x) / view.scale,
          startImageY: (startCenter.clientY - bounds.top - view.y) / view.scale,
          startView: view,
        });
        return;
      }

      setDragAction({
        type: "pan",
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startView: view,
      });
      return;
    }

    if (e.pointerType === "touch" && activePointersRef.current.size > 1) {
      setDragAction(null);
      setRect(null);
      return;
    }

    const p = getImagePoint(e);
    if (!p) return;

    setDragAction({ type: "draw", pointerId: e.pointerId, startPoint: p });
    setRect({ x: p.x, y: p.y, width: 0, height: 0 });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    activePointersRef.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
    });

    if (!dragAction || !selectedCanvas) return;

    if (dragAction.type === "pinch") {
      const first = activePointersRef.current.get(dragAction.pointerIds[0]);
      const second = activePointersRef.current.get(dragAction.pointerIds[1]);
      if (!first || !second || !viewportRef.current) return;

      const distance = getPointerDistance(first, second);
      if (dragAction.startDistance === 0) return;

      const center = getPointerCenter(first, second);
      const bounds = viewportRef.current.getBoundingClientRect();
      const { minScale, maxScale } = getScaleBounds();
      const nextScale = Math.min(
        maxScale,
        Math.max(
          minScale,
          dragAction.startView.scale * (distance / dragAction.startDistance)
        )
      );
      const viewportX = center.clientX - bounds.left;
      const viewportY = center.clientY - bounds.top;

      setView(
        clampView({
          scale: nextScale,
          x: viewportX - dragAction.startImageX * nextScale,
          y: viewportY - dragAction.startImageY * nextScale,
        })
      );
      return;
    }

    if (dragAction.pointerId !== e.pointerId) return;

    if (dragAction.type === "pan") {
      const dx = e.clientX - dragAction.startClientX;
      const dy = e.clientY - dragAction.startClientY;
      setView(
        clampView({
          ...dragAction.startView,
          x: dragAction.startView.x + dx,
          y: dragAction.startView.y + dy,
        })
      );
      return;
    }

    const p = getImagePoint(e);
    if (!p) return;

    setRect({
      x: Math.min(dragAction.startPoint.x, p.x),
      y: Math.min(dragAction.startPoint.y, p.y),
      width: Math.abs(p.x - dragAction.startPoint.x),
      height: Math.abs(p.y - dragAction.startPoint.y),
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    activePointersRef.current.delete(e.pointerId);

    if (
      (dragAction?.type === "pan" || dragAction?.type === "draw") &&
      dragAction.pointerId === e.pointerId
    ) {
      setDragAction(null);
    }

    if (
      dragAction?.type === "pinch" &&
      dragAction.pointerIds.includes(e.pointerId)
    ) {
      setDragAction(null);
    }
  }

  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    onPointerUp(e);
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

          <form
            className="flex gap-2 mb-3"
            onSubmit={(e) => {
              e.preventDefault();
              loadManifestFromUrl();
            }}
          >
            <input
              className="border rounded p-2 flex-1"
              value={manifestUrl}
              onChange={(e) => setManifestUrl(e.target.value)}
              placeholder="manifest URL"
              type="url"
            />

            <button
              className="px-4 py-2 bg-black text-white rounded disabled:opacity-40"
              disabled={manifestUrlLoading}
              type="submit"
            >
              URL読込
            </button>
          </form>

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
                          setViewerMode("draw");
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

          {imageUrl && selectedCanvas && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="inline-flex overflow-hidden border rounded">
                <button
                  className={`px-3 py-2 text-sm ${
                    viewerMode === "pan" ? "bg-black text-white" : "bg-white"
                  }`}
                  onClick={() => setViewerMode("pan")}
                >
                  移動
                </button>
                <button
                  className={`px-3 py-2 text-sm border-l ${
                    viewerMode === "draw" ? "bg-black text-white" : "bg-white"
                  }`}
                  onClick={() => setViewerMode("draw")}
                >
                  矩形
                </button>
              </div>

              <div className="inline-flex items-center overflow-hidden border rounded">
                <button
                  className="px-3 py-2 text-sm"
                  onClick={() => zoomBy(1 / 1.25)}
                >
                  -
                </button>
                <div className="min-w-16 px-3 py-2 text-sm text-center border-x">
                  {getZoomPercent()}%
                </div>
                <button
                  className="px-3 py-2 text-sm"
                  onClick={() => zoomBy(1.25)}
                >
                  +
                </button>
              </div>

              <button
                className="px-3 py-2 text-sm border rounded"
                onClick={resetView}
              >
                全体表示
              </button>
            </div>
          )}

          {imageUrl && selectedCanvas ? (
            <div
              ref={viewportRef}
              className={`relative h-[70vh] min-h-96 overflow-hidden border bg-gray-100 select-none touch-none ${
                viewerMode === "pan"
                  ? "cursor-grab active:cursor-grabbing"
                  : "cursor-crosshair"
              }`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onWheel={onWheel}
            >
              {imageLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm font-bold">
                  読み込み中
                </div>
              )}
              <div
                className="absolute top-0 left-0"
                style={{
                  width: selectedCanvas.width,
                  height: selectedCanvas.height,
                  transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                  transformOrigin: "0 0",
                }}
              >
                <img
                  src={imageUrl}
                  alt=""
                  className="block max-w-none pointer-events-none"
                  style={{
                    width: selectedCanvas.width,
                    height: selectedCanvas.height,
                  }}
                  onLoad={() => {
                    setImageLoading(false);
                    resetView();
                  }}
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
                        left: r.x,
                        top: r.y,
                        width: r.width,
                        height: r.height,
                      }}
                      title={String(label)}
                    />
                  );
                })}

                {rect && (
                  <div
                    className="absolute border-2 border-red-600 bg-red-500/20"
                    style={{
                      left: rect.x,
                      top: rect.y,
                      width: rect.width,
                      height: rect.height,
                    }}
                  />
                )}
              </div>
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
