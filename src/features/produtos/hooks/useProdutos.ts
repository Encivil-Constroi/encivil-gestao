import { useState, useEffect, useCallback } from 'react'
import type { Product } from '@/app/types'
import {
  listarProdutos,
  listarProdutosArquivados,
  buscarProduto,
  criarProduto,
  atualizarProduto,
  desativarProduto,
  restaurarProduto,
  deletarProduto,
  type NovoProduto,
  type AtualizarProduto,
} from '../services/produtosService'

export function useProdutos(apenasAtivos = true) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listarProdutos(apenasAtivos)
      setProducts(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar produtos')
    } finally {
      setLoading(false)
    }
  }, [apenasAtivos])

  useEffect(() => { load() }, [load])

  return { products, loading, error, reload: load }
}

export function useProduto(id: string | undefined) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await buscarProduto(id)
      setProduct(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Produto não encontrado')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  return { product, loading, error, reload: load }
}

export function useCriarProduto() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const criar = async (input: NovoProduto): Promise<Product | null> => {
    setLoading(true)
    setError(null)
    try {
      return await criarProduto(input)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao criar produto'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { criar, loading, error }
}

export function useAtualizarProduto() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const atualizar = async (id: string, input: AtualizarProduto): Promise<Product | null> => {
    setLoading(true)
    setError(null)
    try {
      return await atualizarProduto(id, input)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao atualizar produto'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { atualizar, loading, error }
}

export function useProdutosArquivados(enabled = true) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try { setProducts(await listarProdutosArquivados()) }
    catch { setProducts([]) }
    finally { setLoading(false) }
  }, [enabled])

  useEffect(() => { load() }, [load])
  return { products, loading, reload: load }
}

export function useDesativarProduto() {
  const [loading, setLoading] = useState(false)
  const desativar = async (id: string): Promise<boolean> => {
    setLoading(true)
    try { await desativarProduto(id); return true }
    catch { return false }
    finally { setLoading(false) }
  }
  return { desativar, loading }
}

export function useRestaurarProduto() {
  const [loading, setLoading] = useState(false)
  const restaurar = async (id: string): Promise<boolean> => {
    setLoading(true)
    try { await restaurarProduto(id); return true }
    catch { return false }
    finally { setLoading(false) }
  }
  return { restaurar, loading }
}

export function useDeletarProduto() {
  const [loading, setLoading] = useState(false)
  const deletar = async (id: string): Promise<boolean> => {
    setLoading(true)
    try { await deletarProduto(id); return true }
    catch { return false }
    finally { setLoading(false) }
  }
  return { deletar, loading }
}
