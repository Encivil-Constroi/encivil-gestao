-- =============================================================
-- ENCIVIL — Eventos de segurança + limitador de pedidos (rate limit)
--
-- eventos_seguranca: logins, MFA e recusas do limitador, para o painel do admin.
-- Imutável (só se apagam eventos com mais de 1 ano — retenção).
-- rate_limit_consumir: janela fixa por chave, atómica (INSERT … ON CONFLICT).
-- Usado pelas Edge Functions (papel de serviço) e pelas RPCs de eventos.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS privado;
REVOKE ALL ON SCHEMA privado FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS privado.rate_limit (
  chave          text        NOT NULL,
  janela_inicio  timestamptz NOT NULL,
  contagem       int         NOT NULL DEFAULT 0,
  PRIMARY KEY (chave, janela_inicio)
);
REVOKE ALL ON privado.rate_limit FROM PUBLIC, anon, authenticated;
ALTER TABLE privado.rate_limit ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.eventos_seguranca (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          text NOT NULL CHECK (tipo IN ('login_ok','login_falhado','mfa_registado','mfa_removido',
                                              'mfa_removido_admin','mfa_falhado','rate_limit')),
  utilizador_id uuid,
  email         text,
  detalhe       jsonb NOT NULL DEFAULT '{}',
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eventos_seguranca_criado_idx ON public.eventos_seguranca (criado_em DESC);
CREATE INDEX IF NOT EXISTS eventos_seguranca_tipo_idx   ON public.eventos_seguranca (tipo, criado_em DESC);

ALTER TABLE public.eventos_seguranca ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eventos_seguranca_select_admin ON public.eventos_seguranca;
CREATE POLICY eventos_seguranca_select_admin ON public.eventos_seguranca
  FOR SELECT TO authenticated USING (public.auth_role() = 'admin');
REVOKE ALL ON public.eventos_seguranca FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eventos_seguranca TO authenticated;

CREATE OR REPLACE FUNCTION public._eventos_imutaveis()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.criado_em < now() - interval '365 days' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Os eventos de segurança são imutáveis.';
END $$;
DROP TRIGGER IF EXISTS eventos_seguranca_imutaveis ON public.eventos_seguranca;
CREATE TRIGGER eventos_seguranca_imutaveis BEFORE UPDATE OR DELETE ON public.eventos_seguranca
  FOR EACH ROW EXECUTE FUNCTION public._eventos_imutaveis();

CREATE OR REPLACE FUNCTION public._registar_evento(p_tipo text, p_utilizador uuid, p_detalhe jsonb, p_email text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.eventos_seguranca (tipo, utilizador_id, email, detalhe)
  VALUES (p_tipo, p_utilizador, p_email, coalesce(p_detalhe, '{}'))
$$;

CREATE OR REPLACE FUNCTION public.rate_limit_consumir(p_chave text, p_janela_seg int, p_max int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inicio timestamptz; v_contagem int;
BEGIN
  IF p_chave IS NULL OR length(p_chave) = 0 OR length(p_chave) > 200 OR p_janela_seg IS NULL OR p_janela_seg < 1
     OR p_max IS NULL OR p_max < 1 THEN
    RAISE EXCEPTION 'Parâmetros de limite inválidos.';
  END IF;
  v_inicio := to_timestamp(floor(extract(epoch FROM now()) / p_janela_seg) * p_janela_seg);
  INSERT INTO privado.rate_limit AS r (chave, janela_inicio, contagem) VALUES (p_chave, v_inicio, 1)
  ON CONFLICT (chave, janela_inicio) DO UPDATE SET contagem = r.contagem + 1
  RETURNING contagem INTO v_contagem;
  DELETE FROM privado.rate_limit WHERE chave = p_chave AND janela_inicio < v_inicio;
  IF v_contagem > p_max THEN
    -- Só a primeira recusa da janela gera evento: um ataque não enche a tabela de eventos
    IF v_contagem = p_max + 1 THEN
      PERFORM public._registar_evento('rate_limit', auth.uid(),
        jsonb_build_object('chave', p_chave, 'max', p_max, 'janela_seg', p_janela_seg));
    END IF;
    RETURN false;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.registar_evento_seguranca(p_tipo text, p_detalhe jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão necessária.' USING ERRCODE = '42501'; END IF;
  IF p_tipo NOT IN ('login_ok','mfa_registado','mfa_removido','mfa_falhado') THEN
    RAISE EXCEPTION 'Tipo de evento não permitido.';
  END IF;
  IF length(coalesce(p_detalhe, '{}')::text) > 2000 THEN RAISE EXCEPTION 'Detalhe demasiado grande.'; END IF;
  IF NOT public.rate_limit_consumir('evento:' || auth.uid()::text, 60, 30) THEN RETURN; END IF;
  PERFORM public._registar_evento(p_tipo, auth.uid(), p_detalhe);
END $$;

CREATE OR REPLACE FUNCTION public.registar_login_falhado(p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  -- Acima dos tetos ignora em silêncio: um anónimo não consegue encher a tabela nem sondar o limite
  IF length(v_email) = 0 OR length(v_email) > 254 OR position('@' IN v_email) = 0 THEN RETURN; END IF;
  IF NOT public.rate_limit_consumir('login_falhado:*', 60, 120) THEN RETURN; END IF;
  IF NOT public.rate_limit_consumir('login_falhado:' || md5(v_email), 600, 20) THEN RETURN; END IF;
  PERFORM public._registar_evento('login_falhado', NULL, '{}'::jsonb, v_email);
END $$;

REVOKE ALL ON FUNCTION public._registar_evento(text, uuid, jsonb, text), public.rate_limit_consumir(text, int, int),
  public.registar_evento_seguranca(text, jsonb), public.registar_login_falhado(text), public._eventos_imutaveis()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._registar_evento(text, uuid, jsonb, text), public.rate_limit_consumir(text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.registar_evento_seguranca(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registar_login_falhado(text) TO anon, authenticated;

-- Limpeza diária dos contadores e retenção de 1 ano dos eventos.
-- Um nome de job repetido substitui o anterior (não duplica).
DO $outer$
BEGIN
  PERFORM cron.schedule('seguranca-limpeza', '23 4 * * *', $cmd$
    DELETE FROM privado.rate_limit WHERE janela_inicio < now() - interval '1 day';
    DELETE FROM public.eventos_seguranca WHERE criado_em < now() - interval '365 days';
  $cmd$);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron indisponível — limpeza de rate_limit/eventos_seguranca não agendada: %', SQLERRM;
END;
$outer$;

-- ROLLBACK
-- SELECT cron.unschedule('seguranca-limpeza');
-- DROP FUNCTION IF EXISTS public.registar_login_falhado(text);
-- DROP FUNCTION IF EXISTS public.registar_evento_seguranca(text, jsonb);
-- DROP FUNCTION IF EXISTS public.rate_limit_consumir(text, int, int);
-- DROP FUNCTION IF EXISTS public._registar_evento(text, uuid, jsonb, text);
-- DROP TABLE IF EXISTS public.eventos_seguranca;
-- DROP FUNCTION IF EXISTS public._eventos_imutaveis();
-- DROP TABLE IF EXISTS privado.rate_limit;
