# [P1 · ALTO] Campo "Responsável" usa email em vez do nome real

## Resolução — resolvido pelas tasks de SEGURANÇA (2026-06-12)

Resolvido como efeito colateral da centralização do profile no `AuthContext`.

`useRole()` agora expõe `nome: profile?.nome ?? ''`.
`NewMovementPage` usa `nome` em vez de `user?.email?.split('@')[0]`.

```tsx
const { nome } = useRole();
const [formData, setFormData] = useState({ ..., responsible: nome });
useEffect(() => {
  if (nome) setFormData(prev => ({ ...prev, responsible: prev.responsible || nome }));
}, [nome]);
```

**Critérios cumpridos:**
- [x] Campo "Responsável" mostra nome completo do perfil
- [x] Campo continua editável
