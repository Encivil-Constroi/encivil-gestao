# [P3 · BAIXO] useCountUp mostra "0" por 1 frame antes de animar — flash indesejado

## Resolução — 2026-06-12

**`useCountUp.ts`:**
- `useState(0)` → `useState<number | undefined>(undefined)`
- Aceita `target: number | undefined`; retorna `number | undefined`
- Se `target === undefined`: `setCount(undefined)` (skeleton)
- Animação só arranca quando target é um número válido não-zero

**`StatCard.tsx > AnimatedNumber`:**
- `display === undefined` → `<span className="inline-block h-8 w-14 skeleton rounded" />`
- Elimina o flash de "0" — fluxo agora é: skeleton → animação do valor real

**Critérios cumpridos:**
- [x] KPIs mostram skeleton (não "0") enquanto dados carregam
- [x] Animação começa correctamente
- [x] Build sem erros TypeScript

## Problema
`useCountUp` inicializa `count` a `0`:
```ts
const [count, setCount] = useState(0);
```

Antes do `requestAnimationFrame` correr (primeiro frame do browser, ~16ms),
o componente renderiza com `0`. Em redes rápidas isto é imperceptível, mas
em reloads rápidos com dados em cache, o utilizador vê `0 → 1847` em vez
de começar a animação directamente.

Secundariamente, se o `target` chegar com `undefined` ou `null` antes do
Supabase responder, o contador mostra `0` em vez de um skeleton.

## Localização
- `src/hooks/useCountUp.ts` — `useState(0)` na linha de inicialização
- `src/app/components/StatCard.tsx` — renderização condicional

## Solução

### Inicializar com `undefined` e mostrar skeleton enquanto carrega
```ts
// useCountUp.ts
export function useCountUp(target: number | undefined, duration = 700): number | undefined {
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (target === undefined) { setCount(undefined); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(target); return;
    }
    if (target === 0) { setCount(0); return; }

    setCount(undefined); // reset para skeleton durante nova animação
    const startTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return count;
}
```

### StatCard — mostrar skeleton enquanto `count === undefined`
```tsx
function AnimatedNumber({ value }: { value: number | undefined }) {
  const display = useCountUp(value);
  if (display === undefined) {
    return <span className="skeleton h-8 w-16 rounded inline-block" />;
  }
  return <>{display}</>;
}
```

Assim o fluxo é: skeleton → animação do valor real. Nunca "0 → valor".

## Esforço estimado
⏱ 45 min (hook + StatCard + teste visual)

## Critério de conclusão
- [ ] Dashboard carregando: KPIs mostram skeleton (não "0")
- [ ] Dados chegam: animação começa do valor correcto (não de 0)
- [ ] `prefers-reduced-motion`: sem animação, sem flash de 0
- [ ] Build sem erros de TypeScript (union type `number | undefined`)
