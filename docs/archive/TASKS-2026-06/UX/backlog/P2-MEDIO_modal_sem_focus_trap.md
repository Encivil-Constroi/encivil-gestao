# [P2 · MÉDIO] Modais sem focus trap — acessibilidade e UX

## Decisão de Staff Engineer — diferido conscientemente

**Contexto:** Ferramenta interna B2B com 3-5 utilizadores conhecidos.
Nenhum utiliza leitor de ecrã. O `Esc` está implementado no `ConfirmDialog`.
O esforço (1.5h + testes em 3 modais) tem ROI baixo neste contexto específico.

**Quando executar:** Se o sistema for exposto a utilizadores externos, se houver
requisito de conformidade com WCAG, ou se a equipa crescer e incluir utilizadores
com necessidades de acessibilidade. A solução está documentada abaixo — é trivial
de implementar quando o momento chegar.

## Problema
`AddProductModal`, `EditProductModal`, `ConfirmDialog` e outros modais não
aprisionam o foco dentro do modal quando abertos.

Consequências:
1. **Tab** move o foco para elementos por baixo do overlay → utilizador perde-se
2. **Screen readers** anunciam conteúdo fora do modal como acessível
3. **Esc** nem sempre fecha o modal (só implementado em alguns)
4. Não cumpre WCAG 2.1 critério 2.1.2 (No Keyboard Trap — mas deve ser intencional)

Padrão da indústria (Google Material, Radix UI, shadcn): focus trap automático
+ restaurar foco ao elemento que abriu o modal ao fechar.

## Localização
- `src/app/components/AddProductModal.tsx`
- `src/app/components/EditProductModal.tsx`
- `src/app/components/ConfirmDialog.tsx`

## Solução

### Hook `useFocusTrap` (sem dependências)
Criar `src/hooks/useFocusTrap.ts`:
```ts
import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement;

    // Focar primeiro elemento do modal
    const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
    focusable[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = elements[0];
      const last = elements[elements.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus(); // restaurar foco ao fechar
    };
  }, [active]);

  return containerRef;
}
```

### Uso nos modais
```tsx
const containerRef = useFocusTrap(isOpen);

return (
  <div ref={containerRef} role="dialog" aria-modal="true" aria-label="Editar produto">
    {/* conteúdo do modal */}
  </div>
);
```

### Fechar com Esc (em todos os modais)
```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [onClose]);
```

## Esforço estimado
⏱ 1.5h (hook + aplicar em 3 modais + testes de teclado)

## Critério de conclusão
- [ ] Tab dentro do modal nunca sai do modal
- [ ] Esc fecha qualquer modal aberto
- [ ] Foco retorna ao botão de abertura ao fechar
- [ ] `role="dialog"` e `aria-modal="true"` em todos os modais
