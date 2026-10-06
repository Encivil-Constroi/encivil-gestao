import { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser, Pen } from 'lucide-react';

interface Props {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

export function SignaturePad({ label, value, onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const valueRef = useRef(value);
  const activeRef = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  // Só "arma" o desenho depois de um toque dedicado — enquanto inativo, o
  // canvas deixa o dedo do utilizador fazer scroll normalmente. Sem isto,
  // qualquer swipe que passe por cima da área de assinatura era interpretado
  // como um traço (o utilizador "assinava sem querer" ao tentar descer a página).
  const [active, setActive] = useState(false);

  // Redimensiona o canvas para o tamanho real do contentor, ajustado ao
  // devicePixelRatio — sem isto, assinaturas em ecrãs retina/telemóvel
  // saem borradas ou pixeladas.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width;
    const height = 180;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#1e293b';
  }, []);

  useEffect(() => { valueRef.current = value; }, [value]);

  useEffect(() => {
    setupCanvas();
    const onResize = () => {
      setupCanvas();
      const v = valueRef.current;
      if (!v) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);
      };
      img.src = v;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setupCanvas]);

  // Se já existe uma assinatura guardada (ex: a abrir o termo depois de
  // assinado), desenha-a no canvas a partir da dataURL.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !value) return;
    const img = new Image();
    img.onload = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);
    };
    img.src = value;
  }, [value]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    if (!activeRef.current) { activeRef.current = true; setActive(true); return; }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPointRef.current) return;

    const point = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    if (!hasStrokes) setHasStrokes(true);
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL('image/png'));
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasStrokes(false);
    onChange(null);
  };

  const isEmpty = !hasStrokes && !value;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium">
          {label} <span className="text-destructive">*</span>
        </label>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
          >
            <Eraser className="w-3.5 h-3.5" /> Limpar
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        className={`relative rounded-xl border-2 border-dashed overflow-hidden bg-white ${
          !isEmpty ? 'border-success/40' : active ? 'border-primary/50' : 'border-input'
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
          style={{ touchAction: active ? 'none' : 'auto', display: 'block', cursor: disabled ? 'default' : 'crosshair' }}
        />
        {isEmpty && !active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
            <Pen className="w-4 h-4 text-[#606872]" />
            <p className="text-sm text-[#606872]">Toque aqui para assinar</p>
          </div>
        )}
        {isEmpty && active && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[#606872] pointer-events-none">
            Assine com o dedo ou rato
          </p>
        )}
      </div>
      {isEmpty && <p className="text-xs text-destructive mt-1.5">Assinatura obrigatória para concluir.</p>}
    </div>
  );
}
