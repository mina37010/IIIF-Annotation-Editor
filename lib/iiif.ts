export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getCanvasImage(canvas: any): string | null {
  const body = canvas?.items?.[0]?.items?.[0]?.body;
  if (!body) return null;

  const service = Array.isArray(body.service)
    ? body.service[0]
    : body.service;

  if (service?.id) {
    const serviceId = String(service.id).replace(/\/$/, "");
    const type = service.type ?? service["@type"] ?? "";

    if (String(type).includes("ImageService2")) {
      return `${serviceId}/full/1200,/0/default.jpg`;
    }

    return `${serviceId}/full/1200,/0/default.jpg`;
  }

  if (body.id) { 
    const id = String(body.id);

    if (id.includes("/image/iiif/") && !id.includes("/full/")) {
      return `${id.replace(/\/$/, "")}/full/1200,/0/default.jpg`;
    }

    return id;
  }

  return null;
}

export function parseXywh(target: string): Rect | null {
  const xywh = target.split("#xywh=")[1];
  if (!xywh) return null;

  const [x, y, width, height] = xywh.split(",").map(Number);
  if ([x, y, width, height].some(Number.isNaN)) return null;

  return { x, y, width, height };
}

export function rectToXywh(rect: Rect): string {
  return [
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.width),
    Math.round(rect.height),
  ].join(",");
}

export function getCutAnnotationPage(canvas: any) {
  if (!canvas.annotations) canvas.annotations = [];

  let page = canvas.annotations.find(
    (p: any) => p.id === `${canvas.id}/annotations/cuts`
  );

  if (!page) {
    page = {
      id: `${canvas.id}/annotations/cuts`,
      type: "AnnotationPage",
      items: [],
    };
    canvas.annotations.push(page);
  }

  return page;
}

export function createCutAnnotation(
  canvasId: string,
  cutNumber: string,
  rect: Rect,
  index: number
) {
  return {
    id: `${canvasId}/annotations/cut-${encodeURIComponent(cutNumber)}-${index}`,
    type: "Annotation",
    motivation: "tagging",
    body: {
      type: "TextualBody",
      purpose: "tagging",
      format: "text/plain",
      value: cutNumber,
    },
    target: `${canvasId}#xywh=${rectToXywh(rect)}`,
  };
}

export function addAnnotationToCanvas(
  manifest: any,
  canvasIndex: number,
  cutNumber: string,
  rect: Rect
) {
  const next = structuredClone(manifest);
  const canvas = next.items[canvasIndex];
  const page = getCutAnnotationPage(canvas);

  page.items.push(
    createCutAnnotation(canvas.id, cutNumber, rect, page.items.length + 1)
  );

  return next;
}

export function updateAnnotation(
  manifest: any,
  canvasIndex: number,
  annotationId: string,
  cutNumber: string,
  rect: Rect
) {
  const next = structuredClone(manifest);
  const canvas = next.items[canvasIndex];

  for (const page of canvas.annotations ?? []) {
    const anno = page.items?.find((a: any) => a.id === annotationId);
    if (!anno) continue;

    anno.body = {
      type: "TextualBody",
      purpose: "tagging",
      format: "text/plain",
      value: cutNumber,
    };
    anno.target = `${canvas.id}#xywh=${rectToXywh(rect)}`;
  }

  return next;
}

export function deleteAnnotation(
  manifest: any,
  canvasIndex: number,
  annotationId: string
) {
  const next = structuredClone(manifest);
  const canvas = next.items[canvasIndex];

  for (const page of canvas.annotations ?? []) {
    page.items = (page.items ?? []).filter((a: any) => a.id !== annotationId);
  }

  canvas.annotations = (canvas.annotations ?? []).filter(
    (p: any) => (p.items ?? []).length > 0
  );

  return next;
}