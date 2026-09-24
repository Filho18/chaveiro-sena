const { createClient } = require('@supabase/supabase-js');

/**
 * Serve os dados do painel do sensor.
 *
 * PORQUE EXISTE: a chave anon NAO pode ir para o browser. O projeto Supabase
 * tem ALTER DEFAULT PRIVILEGES a conceder arwdDxtm a anon e authenticated em
 * todas as tabelas, e a blocked_ips e a automation_health estao com RLS
 * desligado — quem tiver a anon key le a lista de bloqueio e pode apaga-la.
 * Por isso a service role key fica DO LADO DO SERVIDOR, aqui, e o browser
 * so ve o resultado ja cozinhado.
 *
 * So leitura: chama uma unica funcao SQL (painel_dados) e devolve o jsonb.
 * Nao ha nenhum caminho de escrita nesta funcao.
 *
 * Autenticacao: token partilhado em PAINEL_TOKEN (variavel de ambiente).
 * Sem token valido devolve 401 e NENHUM dado.
 */
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, private',
    'X-Robots-Tag': 'noindex, nofollow',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ erro: 'metodo nao permitido' }) };
  }

  const esperado = process.env.PAINEL_TOKEN;
  if (!esperado) {
    // sem token configurado o painel fica fechado, nunca aberto
    return { statusCode: 503, headers, body: JSON.stringify({ erro: 'painel nao configurado' }) };
  }

  const q = event.queryStringParameters || {};
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const dado = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (q.t || '').trim();

  // comparacao de comprimento constante, para o token nao se descobrir a tentativas
  const iguais = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  };
  if (!iguais(dado, esperado)) {
    return { statusCode: 401, headers, body: JSON.stringify({ erro: 'token invalido ou ausente' }) };
  }

  let dias = parseInt(q.dias, 10);
  if (!Number.isFinite(dias) || dias < 1 || dias > 90) dias = 14;
  const revelar = q.revelar === '1';

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await sb.rpc('painel_dados', { dias, revelar });
    if (error) throw error;
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ erro: 'falha a ler os dados', detalhe: String(e && e.message).slice(0, 200) }),
    };
  }
};
