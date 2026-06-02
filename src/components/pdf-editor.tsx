import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Type,
  Highlighter,
  Pencil,
  PenLine,
  Eraser,
  Undo2,
  Save,
  Eye,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type Tool = "view" | "text" | "highlight" | "draw" | "signature" | "erase";

type BaseAnn = { id: string; page: number };
type TextAnn = BaseAnn & { kind: "text"; x: number; y: number; text: string; size: number };
type HighlightAnn = BaseAnn & {
  kind: "highlight";
  x: number;
  y: number;
  w: number;
  h: number;
};
type DrawAnn = BaseAnn & { kind: "draw"; points: { x: number; y: number }[]; color: string };
type ImageAnn = BaseAnn & {
  kind: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  dataUrl: string;
};
type Annotation = TextAnn | HighlightAnn | DrawAnn | ImageAnn;

type PageInfo = { width: number; height: number; viewWidth: number; viewHeight: number };

const SCALE = 1.5;

export type PdfEditorProps = {
  bytes: Uint8Array;
  fileName: string;
  canEdit: boolean;
  onSaveCopy: (newBytes: Uint8Array, newName: string) => Promise<void>;
};

export function PdfEditor({ bytes, fileName, canEdit, onSaveCopy }: PdfEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement | null>>(new Map());
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [tool, setTool] = useState<Tool>("view");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [renderError, setRenderError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signaturePending, setSignaturePending] = useState<{ page: number; x: number; y: number } | null>(null);

  // Drag state for highlight + draw
  const drawingRef = useRef<{
    page: number;
    start: { x: number; y: number };
    points?: { x: number; y: number }[];
    id: string;
  } | null>(null);

  // Render PDF
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // pdf.js mutates the input buffer; pass a copy so the original Uint8Array
        // stays usable for pdf-lib later.
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const pdf = await pdfjsLib.getDocument({ data: copy }).promise;
        const out: PageInfo[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: SCALE });
          out.push({
            width: page.view[2] - page.view[0],
            height: page.view[3] - page.view[1],
            viewWidth: viewport.width,
            viewHeight: viewport.height,
          });
        }
        if (cancelled) return;
        setPages(out);
        // Render after canvases are mounted
        setTimeout(async () => {
          if (cancelled) return;
          for (let i = 1; i <= pdf.numPages; i++) {
            const canvas = canvasRefs.current.get(i);
            if (!canvas) continue;
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: SCALE });
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          }
        }, 0);
      } catch (e) {
        console.error(e);
        setRenderError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-49), annotations]);
  }, [annotations]);

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setAnnotations(prev);
      return h.slice(0, -1);
    });
  };

  const addAnnotation = (a: Annotation) => {
    pushHistory();
    setAnnotations((arr) => [...arr, a]);
  };

  const removeAnnotation = (id: string) => {
    pushHistory();
    setAnnotations((arr) => arr.filter((a) => a.id !== id));
  };

  const getRelativeCoords = (e: React.PointerEvent, page: PageInfo) => {
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handlePagePointerDown = (e: React.PointerEvent, pageIdx: number, page: PageInfo) => {
    if (!canEdit || tool === "view") return;
    const { x, y } = getRelativeCoords(e, page);
    if (tool === "text") {
      const text = prompt("Texte à ajouter :");
      if (!text) return;
      addAnnotation({
        id: crypto.randomUUID(),
        page: pageIdx,
        kind: "text",
        x,
        y,
        text,
        size: 14,
      });
    } else if (tool === "signature") {
      setSignaturePending({ page: pageIdx, x, y });
      setSignatureOpen(true);
    } else if (tool === "highlight" || tool === "draw") {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drawingRef.current = {
        page: pageIdx,
        start: { x, y },
        points: tool === "draw" ? [{ x, y }] : undefined,
        id: crypto.randomUUID(),
      };
    }
  };

  const handlePagePointerMove = (e: React.PointerEvent, pageIdx: number, page: PageInfo) => {
    const d = drawingRef.current;
    if (!d || d.page !== pageIdx) return;
    const { x, y } = getRelativeCoords(e, page);
    if (tool === "draw" && d.points) {
      d.points.push({ x, y });
      // force re-render via setAnnotations of preview drawing
      setAnnotations((arr) => {
        const filtered = arr.filter((a) => a.id !== d.id);
        return [
          ...filtered,
          {
            id: d.id,
            page: pageIdx,
            kind: "draw",
            points: [...d.points!],
            color: "#ef4444",
          } as DrawAnn,
        ];
      });
    } else if (tool === "highlight") {
      setAnnotations((arr) => {
        const filtered = arr.filter((a) => a.id !== d.id);
        const xMin = Math.min(d.start.x, x);
        const yMin = Math.min(d.start.y, y);
        const w = Math.abs(x - d.start.x);
        const h = Math.abs(y - d.start.y);
        return [
          ...filtered,
          { id: d.id, page: pageIdx, kind: "highlight", x: xMin, y: yMin, w, h } as HighlightAnn,
        ];
      });
    }
  };

  const handlePagePointerUp = () => {
    if (drawingRef.current) {
      pushHistory();
      // already committed via setAnnotations
    }
    drawingRef.current = null;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const pdfDoc = await PDFDocument.load(copy);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pdfPages = pdfDoc.getPages();
      // Embed images first
      const imageCache = new Map<string, any>();
      for (const a of annotations) {
        if (a.kind === "image" && !imageCache.has(a.dataUrl)) {
          const b64 = a.dataUrl.split(",")[1];
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const img = a.dataUrl.startsWith("data:image/png")
            ? await pdfDoc.embedPng(arr)
            : await pdfDoc.embedJpg(arr);
          imageCache.set(a.dataUrl, img);
        }
      }
      for (const a of annotations) {
        const pIdx = a.page - 1;
        const page = pdfPages[pIdx];
        if (!page) continue;
        const { width: pw, height: ph } = page.getSize();
        if (a.kind === "text") {
          page.drawText(a.text, {
            x: a.x * pw,
            y: ph - a.y * ph - a.size,
            size: a.size,
            font,
            color: rgb(0, 0, 0),
          });
        } else if (a.kind === "highlight") {
          page.drawRectangle({
            x: a.x * pw,
            y: ph - (a.y + a.h) * ph,
            width: a.w * pw,
            height: a.h * ph,
            color: rgb(1, 0.95, 0.2),
            opacity: 0.35,
          });
        } else if (a.kind === "draw") {
          // draw as a series of line segments
          for (let i = 1; i < a.points.length; i++) {
            const p1 = a.points[i - 1];
            const p2 = a.points[i];
            page.drawLine({
              start: { x: p1.x * pw, y: ph - p1.y * ph },
              end: { x: p2.x * pw, y: ph - p2.y * ph },
              thickness: 1.5,
              color: rgb(0.93, 0.27, 0.27),
            });
          }
        } else if (a.kind === "image") {
          const img = imageCache.get(a.dataUrl);
          if (!img) continue;
          page.drawImage(img, {
            x: a.x * pw,
            y: ph - (a.y + a.h) * ph,
            width: a.w * pw,
            height: a.h * ph,
          });
        }
      }
      const out = await pdfDoc.save();
      const baseName = fileName.replace(/\.pdf$/i, "");
      const newName = `${baseName}-modifié.pdf`;
      await onSaveCopy(out, newName);
      toast.success("Copie enregistrée");
    } catch (e: any) {
      console.error(e);
      toast.error(
        e?.message ??
          "Ce PDF ne peut pas être modifié directement. Vous pouvez l’annoter ou enregistrer une copie modifiée.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (renderError) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Impossible d’afficher ce PDF. Veuillez le télécharger ou réessayer.
      </div>
    );
  }

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <Button
      type="button"
      size="sm"
      variant={tool === t ? "default" : "outline"}
      onClick={() => setTool(t)}
      title={label}
      aria-label={label}
      className="h-8 px-2"
    >
      {icon}
      <span className="ml-1 hidden sm:inline">{label}</span>
    </Button>
  );

  return (
    <div className="flex flex-col">
      {canEdit && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b bg-card/95 p-2 backdrop-blur">
          {toolBtn("view", <Eye className="h-4 w-4" />, "Voir")}
          {toolBtn("text", <Type className="h-4 w-4" />, "Texte")}
          {toolBtn("highlight", <Highlighter className="h-4 w-4" />, "Surligner")}
          {toolBtn("draw", <Pencil className="h-4 w-4" />, "Dessiner")}
          {toolBtn("signature", <PenLine className="h-4 w-4" />, "Signature")}
          {toolBtn("erase", <Eraser className="h-4 w-4" />, "Effacer")}
          <div className="mx-1 h-6 w-px bg-border" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={undo}
            disabled={history.length === 0}
            className="h-8 px-2"
            title="Annuler"
            aria-label="Annuler"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <div className="ml-auto">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || annotations.length === 0}
              className="h-8"
            >
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Enregistrer une copie
            </Button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="overflow-auto bg-muted/30 p-2"
        style={{ maxHeight: "75vh", touchAction: "pinch-zoom pan-x pan-y" }}
      >
        {pages.map((p, idx) => {
          const pageNum = idx + 1;
          const pageAnnotations = annotations.filter((a) => a.page === pageNum);
          const cursor =
            tool === "view"
              ? "default"
              : tool === "erase"
                ? "not-allowed"
                : tool === "text" || tool === "signature"
                  ? "text"
                  : "crosshair";
          return (
            <div
              key={pageNum}
              className="relative mx-auto mb-3 max-w-full bg-white shadow"
              style={{ width: p.viewWidth, aspectRatio: `${p.viewWidth} / ${p.viewHeight}` }}
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current.set(pageNum, el);
                }}
                className="block h-auto w-full"
              />
              <div
                className="absolute inset-0"
                style={{ cursor, touchAction: tool === "view" ? "pinch-zoom pan-x pan-y" : "none" }}
                onPointerDown={(e) => handlePagePointerDown(e, pageNum, p)}
                onPointerMove={(e) => handlePagePointerMove(e, pageNum, p)}
                onPointerUp={handlePagePointerUp}
                onPointerCancel={handlePagePointerUp}
              >
                {pageAnnotations.map((a) => {
                  const clickToErase =
                    tool === "erase"
                      ? (e: React.MouseEvent) => {
                          e.stopPropagation();
                          removeAnnotation(a.id);
                        }
                      : undefined;
                  if (a.kind === "text") {
                    return (
                      <div
                        key={a.id}
                        onClick={clickToErase}
                        className="absolute select-none whitespace-pre"
                        style={{
                          left: `${a.x * 100}%`,
                          top: `${a.y * 100}%`,
                          fontSize: a.size,
                          color: "#000",
                          pointerEvents: tool === "erase" ? "auto" : "none",
                        }}
                      >
                        {a.text}
                      </div>
                    );
                  }
                  if (a.kind === "highlight") {
                    return (
                      <div
                        key={a.id}
                        onClick={clickToErase}
                        className="absolute"
                        style={{
                          left: `${a.x * 100}%`,
                          top: `${a.y * 100}%`,
                          width: `${a.w * 100}%`,
                          height: `${a.h * 100}%`,
                          background: "rgba(255, 235, 50, 0.35)",
                          pointerEvents: tool === "erase" ? "auto" : "none",
                        }}
                      />
                    );
                  }
                  if (a.kind === "image") {
                    return (
                      <img
                        key={a.id}
                        src={a.dataUrl}
                        alt="annotation"
                        onClick={clickToErase}
                        className="absolute"
                        style={{
                          left: `${a.x * 100}%`,
                          top: `${a.y * 100}%`,
                          width: `${a.w * 100}%`,
                          height: `${a.h * 100}%`,
                          pointerEvents: tool === "erase" ? "auto" : "none",
                        }}
                      />
                    );
                  }
                  // draw
                  return (
                    <svg
                      key={a.id}
                      onClick={clickToErase}
                      className="absolute inset-0 h-full w-full"
                      viewBox="0 0 1 1"
                      preserveAspectRatio="none"
                      style={{ pointerEvents: tool === "erase" ? "auto" : "none" }}
                    >
                      <polyline
                        points={a.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke={a.color}
                        strokeWidth={0.004}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  );
                })}
              </div>
            </div>
          );
        })}
        {pages.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">Chargement du PDF…</div>
        )}
      </div>

      <SignatureDialog
        open={signatureOpen}
        onOpenChange={(o) => {
          setSignatureOpen(o);
          if (!o) setSignaturePending(null);
        }}
        onConfirm={(dataUrl) => {
          if (signaturePending) {
            addAnnotation({
              id: crypto.randomUUID(),
              page: signaturePending.page,
              kind: "image",
              x: signaturePending.x,
              y: signaturePending.y,
              w: 0.2,
              h: 0.08,
              dataUrl,
            });
          }
          setSignatureOpen(false);
          setSignaturePending(null);
        }}
      />
    </div>
  );
}

function SignatureDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#0f172a";
    hasInkRef.current = false;
  }, [open]);

  const point = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signature</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border bg-white">
          <canvas
            ref={canvasRef}
            width={500}
            height={180}
            style={{ touchAction: "none", width: "100%", height: 180 }}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              drawingRef.current = true;
              const ctx = canvasRef.current!.getContext("2d")!;
              const p = point(e);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
            }}
            onPointerMove={(e) => {
              if (!drawingRef.current) return;
              const ctx = canvasRef.current!.getContext("2d")!;
              const p = point(e);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
              hasInkRef.current = true;
            }}
            onPointerUp={() => {
              drawingRef.current = false;
            }}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              const c = canvasRef.current;
              if (!c) return;
              c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
              hasInkRef.current = false;
            }}
          >
            Effacer
          </Button>
          <Button
            onClick={() => {
              if (!hasInkRef.current) {
                toast.error("Signature vide");
                return;
              }
              const dataUrl = canvasRef.current!.toDataURL("image/png");
              onConfirm(dataUrl);
            }}
          >
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
