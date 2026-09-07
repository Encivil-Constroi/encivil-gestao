-- ================================================================
-- Double-submit guard: constraint de deduplicação em abastecimentos
--
-- Impede que o mesmo abastecimento seja registado duas vezes por
-- double-click ou race condition de rede.
-- Regra: mesma viatura + mesma data + mesmos litros + mesmo custo = duplicado.
-- (Na prática nunca se abastece exactamente o mesmo volume ao mesmo custo
--  para a mesma viatura no mesmo dia duas vezes de forma legítima.)
-- ================================================================

CREATE UNIQUE INDEX IF NOT EXISTS comb_abastecimentos_dedup_idx
  ON public.comb_abastecimentos (veiculo_id, data, litros, custo_total);

-- Nota: comb_abastecimentos_pendentes já tem rate limiting (M4).
-- Nota: registar_movimento usa advisory lock (sem risco de duplicado).
-- Nota: registar_emprestimo_ferramenta usa FOR UPDATE + check estado (sem risco).
-- Nota: criar_auto_rpc usa advisory lock por subempreiteiro (sem risco).
