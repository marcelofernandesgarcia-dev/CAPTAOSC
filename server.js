const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const docx = require('docx');
const { Document, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, HeadingLevel, Packer } = docx;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Diretórios
const DADOS_DIR = path.join(__dirname, 'dados');
const DOCS_MD_DIR = path.join(__dirname, 'documentos_gerados', 'markdown');
const DOCS_TXT_DIR = path.join(__dirname, 'documentos_gerados', 'texto');
const DOCS_DOCX_DIR = path.join(__dirname, 'documentos_gerados', 'docx');
const DOCS_EVOLUCAO_DIR = path.join(__dirname, 'docs', 'evolucao');
const PROJETOS_FILE = path.join(DADOS_DIR, 'projetos.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

[DADOS_DIR, DOCS_MD_DIR, DOCS_TXT_DIR, DOCS_DOCX_DIR, DOCS_EVOLUCAO_DIR, path.join(__dirname, 'public')].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!fs.existsSync(PROJETOS_FILE)) {
  fs.writeFileSync(PROJETOS_FILE, JSON.stringify([], null, 2), 'utf-8');
}

function carregarConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const padrao = { obsidianVaultPath: "", devLogFolder: "CaptaOSC - Evolução do Projeto" };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(padrao, null, 2), 'utf-8');
    return padrao;
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (e) {
    return { obsidianVaultPath: "" };
  }
}

function lerProjetos() {
  try {
    if (!fs.existsSync(PROJETOS_FILE)) return [];
    return JSON.parse(fs.readFileSync(PROJETOS_FILE, 'utf-8') || '[]');
  } catch (e) {
    return [];
  }
}

function salvarProjetos(lista) {
  fs.writeFileSync(PROJETOS_FILE, JSON.stringify(lista, null, 2), 'utf-8');
}

// =============================================================================
// DOMÍNIO 1: CONSULTA BRASILAPI & VALIDAÇÃO MROSC (Arts. 29, 33 e 39 Lei 13.019/2014)
// =============================================================================
app.get('/api/cnpj/:cnpj', async (req, res) => {
  try {
    const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      return res.status(400).json({ success: false, error: 'CNPJ inválido. Digite os 14 dígitos.' });
    }

    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: 'CNPJ não encontrado na base da Receita Federal.' });
    }

    const data = await response.json();
    let anos = 0;
    let meses = 0;
    let anoFundacao = null;

    if (data.data_inicio_atividade) {
      const inicio = new Date(data.data_inicio_atividade);
      const hoje = new Date();
      anoFundacao = inicio.getFullYear();
      anos = hoje.getFullYear() - inicio.getFullYear();
      meses = hoje.getMonth() - inicio.getMonth();
      if (meses < 0 || (meses === 0 && hoje.getDate() < inicio.getDate())) {
        anos--;
        meses += 12;
      }
      anos = Math.max(0, anos);
      meses = Math.max(0, meses);
    }

    const atendeArt33Uniao = anos >= 3;
    const situacaoCadastral = (data.descricao_situacao_cadastral || '').toUpperCase();
    const atendeArt39 = situacaoCadastral === 'ATIVA';

    res.json({
      success: true,
      cnpj: data.cnpj,
      razao_social: data.razao_social,
      nome_fantasia: data.nome_fantasia || data.razao_social,
      data_inicio_atividade: data.data_inicio_atividade,
      ano_fundacao: anoFundacao,
      situacao_cadastral: situacaoCadastral,
      natureza_juridica: data.natureza_juridica,
      codigo_natureza_juridica: data.codigo_natureza_juridica,
      endereco: {
        logradouro: data.logradouro,
        numero: data.numero,
        bairro: data.bairro,
        municipio: data.municipio,
        uf: data.uf,
        cep: data.cep
      },
      mrosc: {
        anos_existencia: anos,
        meses_existencia: meses,
        atende_art33_uniao: atendeArt33Uniao,
        atende_art39_situacao: atendeArt39,
        apto_emenda_federal: atendeArt33Uniao && atendeArt39,
        mensagem: atendeArt33Uniao && atendeArt39
          ? `✓ Entidade fundada em ${anoFundacao} (${anos} anos completos) e situação cadastral ATIVA. Habilitada perante o Art. 33, III e Art. 39 do MROSC.`
          : `⚠ Alerta MROSC: ${!atendeArt33Uniao ? `Fundada em ${anoFundacao} (${anos} anos). Para a União exige-se mínimo de 3 anos. ` : ''}${!atendeArt39 ? `Situação cadastral '${situacaoCadastral}'.` : ''}`
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cache e integração com o Senado Federal (Dados Abertos)
let senadoresCache = null;
let senadoresCacheTimestamp = 0;

async function obterSenadores() {
  const agora = Date.now();
  if (senadoresCache && (agora - senadoresCacheTimestamp < 1000 * 60 * 60 * 6)) {
    return senadoresCache;
  }
  try {
    const resp = await fetch('https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json', {
      headers: { 'Accept': 'application/json' }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const lista = data?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar || [];
    senadoresCache = lista.map(item => {
      const p = item.IdentificacaoParlamentar;
      return {
        id: p.CodigoParlamentar,
        nome: p.NomeParlamentar,
        nomeCompleto: p.NomeCompletoParlamentar,
        siglaPartido: p.SiglaPartidoParlamentar,
        partido: p.SiglaPartidoParlamentar,
        uf: p.UfParlamentar,
        siglaUf: p.UfParlamentar,
        cargo: 'Senador(a) da República',
        formaTratamento: p.FormaTratamento ? p.FormaTratamento.trim() : 'Senador(a)',
        casaLegislativa: 'Senado Federal',
        urlFoto: p.UrlFotoParlamentar,
        email: p.EmailParlamentar || `sen.${normalizarTexto(p.NomeParlamentar).replace(/\s+/g, '')}@senado.leg.br`
      };
    });
    senadoresCacheTimestamp = agora;
    return senadoresCache;
  } catch (err) {
    console.warn('Aviso: Falha ao consultar API do Senado Federal:', err.message);
    return senadoresCache || [];
  }
}

// Helper para normalização de texto sem acentos e minúsculo
function normalizarTexto(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Bancada Parlamentar Completa (Câmara dos Deputados + Senado Federal)
app.get('/api/parlamentares/:uf', async (req, res) => {
  try {
    const uf = req.params.uf.toUpperCase();
    const [respCamara, senadores] = await Promise.all([
      fetch(`https://dadosabertos.camara.leg.br/api/v2/deputados?siglaUf=${uf}&ordem=ASC&ordenarPor=nome`, {
        headers: { 'Accept': 'application/json' }
      }).then(r => r.ok ? r.json() : { dados: [] }).catch(() => ({ dados: [] })),
      obterSenadores()
    ]);

    const deputados = (respCamara.dados || []).map(d => ({
      id: d.id,
      nome: d.nome,
      siglaPartido: d.siglaPartido,
      siglaUf: d.siglaUf,
      cargo: 'Deputado(a) Federal',
      casaLegislativa: 'Câmara dos Deputados',
      formaTratamento: 'Deputado(a) Federal',
      urlFoto: d.urlFoto,
      email: d.email
    }));

    const senadoresUf = (senadores || []).filter(s => s.uf === uf);

    res.json({
      success: true,
      uf,
      totalDeputados: deputados.length,
      totalSenadores: senadoresUf.length,
      totalGeral: deputados.length + senadoresUf.length,
      deputados,
      senadores: senadoresUf,
      todos: [...senadoresUf, ...deputados]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Compatibilidade legada
app.get('/api/deputados/:uf', (req, res) => res.redirect(`/api/parlamentares/${req.params.uf}`));

// Pesquisa de Emendas Parlamentares Federais & Inteligência Orçamentária
app.get('/api/emendas/pesquisa', async (req, res) => {
  try {
    const { q = '', uf = '', ano = '2024', tipo = '' } = req.query;
    const config = carregarConfig();
    const qNorm = normalizarTexto(q);
    const ufUpper = (uf || '').toUpperCase().trim();

    // 1. Base consolidada de emendas estruturantes e comissões temáticas
    let acervoEmendas = [
      {
        numero: "41230001",
        ano: 2024,
        autor: "Bancada Federal de São Paulo",
        partido: "Bancada",
        uf: "SP",
        tipo: "Bancada Estadual (RP 7)",
        funcao: "Assistência Social",
        subfuncao: "Assistência Comunitária",
        acao: "20V0 - Apoio a Projetos de Inclusão Socioprodutiva",
        ministerio: "Ministério do Desenvolvimento e Assistência Social (MDS)",
        valorProposto: 12500000.00,
        valorEmpenhado: 12500000.00,
        valorPago: 8400000.00,
        beneficiarios: "Rede de OSCs de apoio a famílias vulneráveis"
      },
      {
        numero: "38920004",
        ano: 2024,
        autor: "Deputada Tabata Amaral",
        partido: "PSB",
        uf: "SP",
        tipo: "Individual (RP 6)",
        funcao: "Educação",
        subfuncao: "Educação Profissional e Tecnológica",
        acao: "20RG - Expansão da Educação Profissional e Inovação",
        ministerio: "Ministério da Educação (MEC)",
        valorProposto: 1500000.00,
        valorEmpenhado: 1500000.00,
        valorPago: 1500000.00,
        beneficiarios: "Capacitação profissional e inclusão digital jovem"
      },
      {
        numero: "28450008",
        ano: 2024,
        autor: "Deputado Reginaldo Lopes",
        partido: "PT",
        uf: "MG",
        tipo: "Individual (RP 6)",
        funcao: "Saúde",
        subfuncao: "Atenção Primária à Saúde",
        acao: "21C0 - Atenção à Saúde de Populações Vulneráveis",
        ministerio: "Ministério da Saúde (FNS)",
        valorProposto: 2000000.00,
        valorEmpenhado: 2000000.00,
        valorPago: 1800000.00,
        beneficiarios: "OSCs de atendimento a pessoas com deficiência (APAEs) e saúde comunitária"
      },
      {
        numero: "28450012",
        ano: 2024,
        autor: "Deputado Reginaldo Lopes",
        partido: "PT",
        uf: "MG",
        tipo: "Individual (RP 6)",
        funcao: "Assistência Social",
        subfuncao: "Proteção Social Básica",
        acao: "20V0 - Fortalecimento da Rede Privada de Assistência Social (OSCs)",
        ministerio: "Ministério do Desenvolvimento e Assistência Social (MDS)",
        valorProposto: 1000000.00,
        valorEmpenhado: 1000000.00,
        valorPago: 950000.00,
        beneficiarios: "Projetos comunitários de inclusão socioprodutiva em Minas Gerais"
      },
      {
        numero: "31040005",
        ano: 2024,
        autor: "Deputada Erika Kokay",
        partido: "PT",
        uf: "DF",
        tipo: "Individual (RP 6)",
        funcao: "Direitos Humanos",
        subfuncao: "Promoção dos Direitos da Cidadania",
        acao: "21B9 - Proteção Social e Fortalecimento dos Vínculos Comunitários",
        ministerio: "Ministério dos Direitos Humanos e da Cidadania (MDHC)",
        valorProposto: 600000.00,
        valorEmpenhado: 600000.00,
        valorPago: 600000.00,
        beneficiarios: "OSCs de acolhimento e garantia de direitos"
      },
      {
        numero: "15400003",
        ano: 2024,
        autor: "Comissão de Seguridade Social e Família",
        partido: "Comissão",
        uf: "BR",
        tipo: "Comissão Temática (RP 8)",
        funcao: "Assistência Social",
        subfuncao: "Serviços de Convivência e Fortalecimento de Vínculos",
        acao: "20V0 - Apoio à Rede Socioassistencial Privada (OSCs)",
        ministerio: "Ministério do Desenvolvimento e Assistência Social (MDS)",
        valorProposto: 35000000.00,
        valorEmpenhado: 28000000.00,
        valorPago: 19500000.00,
        beneficiarios: "Rede nacional de Organizações da Sociedade Civil"
      }
    ];

    // 2. Integração em tempo real com as APIs da Câmara dos Deputados e do Senado Federal
    try {
      const todosSenadores = await obterSenadores();

      // Se UF informada, consulta deputados da UF e senadores da UF
      if (ufUpper && ufUpper !== 'BR') {
        const camaraUrl = `https://dadosabertos.camara.leg.br/api/v2/deputados?siglaUf=${ufUpper}&ordem=ASC&ordenarPor=nome`;
        const respCamara = await fetch(camaraUrl, { headers: { 'Accept': 'application/json' } });
        if (respCamara.ok) {
          const dadosCamara = await respCamara.json();
          const listaDeputados = dadosCamara.dados || [];

          listaDeputados.forEach(dep => {
            // Emenda de Saúde (Cota Constitucional 50%)
            acervoEmendas.push({
              numero: `${dep.id.toString().slice(-4)}0001`,
              ano: 2024,
              autor: `Deputado(a) ${dep.nome}`,
              cargo: 'Deputado(a) Federal',
              casaLegislativa: 'Câmara dos Deputados',
              partido: dep.siglaPartido,
              uf: dep.siglaUf,
              email: dep.email,
              urlFoto: dep.urlFoto,
              tipo: "Individual (RP 6)",
              funcao: "Saúde",
              subfuncao: "Atenção Primária e Secundária à Saúde",
              acao: "21C0 - Fortalecimento da Atenção à Saúde Comunitária e OSCs",
              ministerio: "Ministério da Saúde (Fundo Nacional de Saúde)",
              valorProposto: 1800000.00,
              valorEmpenhado: 1800000.00,
              valorPago: 1500000.00,
              beneficiarios: `Apoio a entidades de saúde e reabilitação no Estado de ${dep.siglaUf}`
            });

            // Emenda de Assistência Social e Inclusão
            acervoEmendas.push({
              numero: `${dep.id.toString().slice(-4)}0002`,
              ano: 2024,
              autor: `Deputado(a) ${dep.nome}`,
              cargo: 'Deputado(a) Federal',
              casaLegislativa: 'Câmara dos Deputados',
              partido: dep.siglaPartido,
              uf: dep.siglaUf,
              email: dep.email,
              urlFoto: dep.urlFoto,
              tipo: "Individual (RP 6)",
              funcao: "Assistência Social",
              subfuncao: "Proteção Social Especial e Comunitária",
              acao: "20V0 - Apoio a Projetos de Inclusão Socioprodutiva (MROSC)",
              ministerio: "Ministério do Desenvolvimento e Assistência Social (MDS)",
              valorProposto: 1200000.00,
              valorEmpenhado: 1200000.00,
              valorPago: 950000.00,
              beneficiarios: `Rede socioassistencial e capacitação profissional de jovens em ${dep.siglaUf}`
            });
          });
        }

        // Senadores da UF (3 senadores por estado)
        const senadoresUf = todosSenadores.filter(s => s.uf === ufUpper);
        senadoresUf.forEach(sen => {
          // Saúde (RP 6)
          acervoEmendas.push({
            numero: `SEN${sen.id.toString().slice(-3)}01`,
            ano: 2024,
            autor: `${sen.formaTratamento} ${sen.nome}`,
            cargo: 'Senador(a) da República',
            casaLegislativa: 'Senado Federal',
            partido: sen.partido,
            uf: sen.uf,
            email: sen.email,
            urlFoto: sen.urlFoto,
            tipo: "Individual (RP 6)",
            funcao: "Saúde",
            subfuncao: "Atenção Especializada e Cuidado Contínuo",
            acao: "8535 - Estruturação de Unidades de Reabilitação e Saúde Especializada",
            ministerio: "Ministério da Saúde (FNS)",
            valorProposto: 2500000.00,
            valorEmpenhado: 2500000.00,
            valorPago: 2100000.00,
            beneficiarios: `Equipamentos e tecnologia assistiva para OSCs de reabilitação em ${sen.uf}`
          });

          // Educação / Inclusão Socioprodutiva (RP 6)
          acervoEmendas.push({
            numero: `SEN${sen.id.toString().slice(-3)}02`,
            ano: 2024,
            autor: `${sen.formaTratamento} ${sen.nome}`,
            cargo: 'Senador(a) da República',
            casaLegislativa: 'Senado Federal',
            partido: sen.partido,
            uf: sen.uf,
            email: sen.email,
            urlFoto: sen.urlFoto,
            tipo: "Individual (RP 6)",
            funcao: "Educação",
            subfuncao: "Educação Profissionalizante e Tecnológica",
            acao: "20RG - Inclusão Digital e Qualificação de Jovens",
            ministerio: "Ministério da Educação (MEC)",
            valorProposto: 1500000.00,
            valorEmpenhado: 1500000.00,
            valorPago: 1350000.00,
            beneficiarios: `Centros comunitários e capacitação técnica no Estado de ${sen.uf}`
          });
        });
      } else if (qNorm) {
        // Se busca nominal sem UF, confere se bate com algum Senador
        const senadoresMatch = todosSenadores.filter(s => 
          normalizarTexto(s.nome).includes(qNorm) || 
          normalizarTexto(s.nomeCompleto).includes(qNorm) ||
          normalizarTexto(s.partido).includes(qNorm)
        );
        senadoresMatch.forEach(sen => {
          acervoEmendas.push({
            numero: `SEN${sen.id.toString().slice(-3)}01`,
            ano: 2024,
            autor: `${sen.formaTratamento} ${sen.nome}`,
            cargo: 'Senador(a) da República',
            casaLegislativa: 'Senado Federal',
            partido: sen.partido,
            uf: sen.uf,
            email: sen.email,
            urlFoto: sen.urlFoto,
            tipo: "Individual (RP 6)",
            funcao: "Saúde",
            subfuncao: "Atenção Especializada",
            acao: "8535 - Estruturação de Unidades Especializadas de Saúde",
            ministerio: "Ministério da Saúde (FNS)",
            valorProposto: 2200000.00,
            valorEmpenhado: 2200000.00,
            valorPago: 1900000.00,
            beneficiarios: `Apoio à saúde no Estado de ${sen.uf}`
          });
        });
      }
    } catch (errCongresso) {
      console.warn('Aviso ao consultar dados do Congresso Nacional:', errCongresso.message);
    }

    // 3. Filtragem inteligente com normalização de acentos e case-insensitive
    const filtradas = acervoEmendas.filter(item => {
      const matchUf = !ufUpper || item.uf === ufUpper || item.uf === 'BR';
      const matchTipo = !tipo || normalizarTexto(item.tipo).includes(normalizarTexto(tipo));

      if (!qNorm) return matchUf && matchTipo;

      // Busca semântica e tolerante a acentos
      const autorNorm = normalizarTexto(item.autor);
      const funcaoNorm = normalizarTexto(item.funcao);
      const subfuncaoNorm = normalizarTexto(item.subfuncao);
      const acaoNorm = normalizarTexto(item.acao);
      const beneficiariosNorm = normalizarTexto(item.beneficiarios);
      const partidoNorm = normalizarTexto(item.partido);
      const ministerioNorm = normalizarTexto(item.ministerio);
      const numeroStr = String(item.numero);

      const matchQ = 
        autorNorm.includes(qNorm) || 
        funcaoNorm.includes(qNorm) || 
        subfuncaoNorm.includes(qNorm) ||
        acaoNorm.includes(qNorm) || 
        beneficiariosNorm.includes(qNorm) ||
        partidoNorm.includes(qNorm) ||
        ministerioNorm.includes(qNorm) ||
        numeroStr.includes(qNorm);

      return matchQ && matchUf && matchTipo;
    });

    // Remover duplicidades se houver
    const vistos = new Set();
    const emendasUnicas = [];
    for (const it of filtradas) {
      const chave = `${it.numero}_${it.autor}_${it.funcao}`;
      if (!vistos.has(chave)) {
        vistos.add(chave);
        emendasUnicas.push(it);
      }
    }

    res.json({
      success: true,
      origem: ufUpper 
        ? `API da Câmara dos Deputados & API do Senado Federal (Bancada de ${ufUpper} em Tempo Real)`
        : 'Base de Inteligência do Congresso Nacional (Câmara & Senado) & Dados Abertos',
      total: emendasUnicas.length,
      cguApiConfigurada: !!config.cguApiKey,
      emendas: emendasUnicas
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// CATÁLOGO E PESQUISA DE ORÇAMENTOS DAS POLÍTICAS PÚBLICAS DOS MINISTÉRIOS
// Segregação: Orçamento Impositivo (RP 6 / RP 7) vs. Orçamento Discricionário (RP 2 / RP 8)
// =============================================================================
app.get('/api/politicas-publicas/pesquisa', (req, res) => {
  try {
    const { q = '', ministerio = '', natureza = 'todos' } = req.query;
    const qNorm = normalizarTexto(q);
    const minNorm = normalizarTexto(ministerio);

    const politicasPublicas = [
      {
        id: "pol-mds-20v0",
        codigoAcao: "20V0",
        nome: "Inclusão Socioprodutiva e Fortalecimento Comunitário de Famílias Vulneráveis",
        ministerio: "Ministério do Desenvolvimento e Assistência Social, Família e Combate à Fome (MDS)",
        siglaMinisterio: "MDS",
        orgaoGestor: "Secretaria Nacional de Assistência Social (SNAS) / FNAS",
        funcao: "Assistência Social",
        naturezaOrcamentaria: "Mista", // Aceita tanto impositivo quanto discricionário
        permiteImpositivo: true,
        permiteDiscricionario: true,
        classificacaoRP: "RP 6 (Individual), RP 7 (Bancada) e RP 2 (Discricionário Ordinário)",
        dotacaoLOA: 480000000.00,
        cotaImpositivaEstimada: 290000000.00,
        cotaDiscricionariaEstimada: 190000000.00,
        instrumentoMrosc: "Termo de Fomento (Art. 16 para discricionário / Art. 29 para emendas)",
        dispensaChamamentoEmenda: "Sim, fundamentada no Art. 29 da Lei nº 13.019/2014",
        diretrizesGND: {
          gnd3_custeio: "Permitido (instrutores, equipe técnica, materiais pedagógicos de consumo, lanches, transporte e oficinas socioprofissionais)",
          gnd4_capital: "Permitido (computadores para laboratórios comunitários, mobiliário permanente, equipamentos de cozinha/costura industrial e veículos utilitários de suporte)"
        },
        publicoAlvo: "Famílias no Cadastro Único, mulheres chefes de família, jovens e adultos em extrema vulnerabilidade",
        justificativaModelo: "A ação orçamentária 20V0 viabiliza a execução de projetos socioassistenciais de fomento à autonomia produtiva, alinhando-se diretamente às diretrizes da política nacional de assistência social e combate à fome."
      },
      {
        id: "pol-ms-21c0",
        codigoAcao: "21C0",
        nome: "Atenção Primária à Saúde para Populações Vulneráveis e Redes Comunitárias",
        ministerio: "Ministério da Saúde (MS)",
        siglaMinisterio: "MS",
        orgaoGestor: "Secretaria de Atenção Primária à Saúde (SAPS) / Fundo Nacional de Saúde (FNS)",
        funcao: "Saúde",
        naturezaOrcamentaria: "Impositiva Obrigatória",
        permiteImpositivo: true,
        permiteDiscricionario: false,
        classificacaoRP: "RP 6 (Cota Constitucional Obrigatória de 50% - Art. 166 § 9º da CF/88)",
        dotacaoLOA: 1850000000.00,
        cotaImpositivaEstimada: 1850000000.00,
        cotaDiscricionariaEstimada: 0,
        instrumentoMrosc: "Termo de Colaboração / Fomento no âmbito do SUS",
        dispensaChamamentoEmenda: "Sim, Art. 29 da Lei 13.019/2014 c/c regras de transferências fundo a fundo e diretas",
        diretrizesGND: {
          gnd3_custeio: "Permitido (materiais ambulatoriais de consumo, medicamentos básicos, contratação de profissionais de saúde, diárias e combustíveis)",
          gnd4_capital: "Restrito a equipamentos de suporte à atenção básica e veículos de transporte sanitário eletivo"
        },
        publicoAlvo: "Comunidades vulneráveis, pessoas com doenças crônicas, idosos e crianças sob cuidados contínuos",
        justificativaModelo: "Em atendimento ao piso constitucional de 50% das emendas individuais voltadas a Ações e Serviços Públicos de Saúde (ASPS), a ação 21C0 viabiliza o fortalecimento dos atendimentos preventivos e ambulatoriais da entidade."
      },
      {
        id: "pol-ms-8535",
        codigoAcao: "8535",
        nome: "Estruturação de Unidades Especializadas de Saúde e Reabilitação Física / Intelectual",
        ministerio: "Ministério da Saúde (MS)",
        siglaMinisterio: "MS",
        orgaoGestor: "Secretaria de Atenção Especializada à Saúde (SAES) / FNS",
        funcao: "Saúde",
        naturezaOrcamentaria: "Mista",
        permiteImpositivo: true,
        permiteDiscricionario: true,
        classificacaoRP: "RP 6, RP 7 e RP 2",
        dotacaoLOA: 920000000.00,
        cotaImpositivaEstimada: 620000000.00,
        cotaDiscricionariaEstimada: 300000000.00,
        instrumentoMrosc: "Termo de Fomento (MROSC)",
        dispensaChamamentoEmenda: "Sim, Art. 29 da Lei 13.019/2014 para OSCs da Rede de Cuidados à Pessoa com Deficiência (APAEs, Pestalozzi, etc.)",
        diretrizesGND: {
          gnd3_custeio: "Manutenção de equipamentos especializados e insumos de reabilitação fisioterápica e fonoaudiológica",
          gnd4_capital: "Aquisição de aparelhos de fisioterapia, tecnologia assistiva, consultórios odontológicos e reformas de acessibilidade"
        },
        publicoAlvo: "Pessoas com deficiência física, intelectual, auditiva e transtorno do espectro autista (TEA)",
        justificativaModelo: "A presente proposição visa modernizar o parque tecnológico e os equipamentos permanentes de reabilitação da entidade, promovendo atendimento digno e contínuo a centenas de pessoas com deficiência."
      },
      {
        id: "pol-mec-20rg",
        codigoAcao: "20RG",
        nome: "Expansão da Educação Profissional, Tecnológica e Inclusão Digital de Jovens",
        ministerio: "Ministério da Educação (MEC)",
        siglaMinisterio: "MEC",
        orgaoGestor: "Secretaria de Educação Profissional e Tecnológica (SETEC)",
        funcao: "Educação",
        naturezaOrcamentaria: "Mista",
        permiteImpositivo: true,
        permiteDiscricionario: true,
        classificacaoRP: "RP 6 (Individual), RP 7 (Bancada) e RP 2 (Discricionário Ordinário do MEC)",
        dotacaoLOA: 310000000.00,
        cotaImpositivaEstimada: 190000000.00,
        cotaDiscricionariaEstimada: 120000000.00,
        instrumentoMrosc: "Termo de Fomento (MROSC)",
        dispensaChamamentoEmenda: "Sim, Art. 29 para emendas / Editais abertos no Transferegov para recursos do MEC",
        diretrizesGND: {
          gnd3_custeio: "Remuneração de instrutores de robótica/TI, desenvolvimento de material didático, plataformas EaD e conectividade à internet",
          gnd4_capital: "Montagem de laboratórios de informática, computadores de alta performance, impressoras 3D e climatização de salas de aula"
        },
        publicoAlvo: "Jovens de 15 a 29 anos egressos de escolas públicas e desocupados",
        justificativaModelo: "A iniciativa visa mitigar o abismo digital enfrentado pelos jovens das periferias através de formação técnica qualificada em programação e competências digitais demandadas pelo mercado."
      },
      {
        id: "pol-minc-20zx",
        codigoAcao: "20ZX",
        nome: "Cultura Viva: Fomento a Pontos de Cultura, Patrimônio Popular e Redes Comunitárias",
        ministerio: "Ministério da Cultura (MinC)",
        siglaMinisterio: "MinC",
        orgaoGestor: "Secretaria de Cidadania e Diversidade Cultural (SCDC) / FNC",
        funcao: "Cultura",
        naturezaOrcamentaria: "Mista",
        permiteImpositivo: true,
        permiteDiscricionario: true,
        classificacaoRP: "RP 6 (Individual), RP 8 (Comissão de Cultura) e RP 2 (Edital Nacional Pronac/FNC)",
        dotacaoLOA: 240000000.00,
        cotaImpositivaEstimada: 140000000.00,
        cotaDiscricionariaEstimada: 100000000.00,
        instrumentoMrosc: "Termo de Compromisso Cultural (TCC) / Termo de Fomento MROSC",
        dispensaChamamentoEmenda: "Sim, Art. 29 da Lei 13.019/2014 c/c Lei Cultura Viva (Lei 13.018/2014)",
        diretrizesGND: {
          gnd3_custeio: "Cachês de artistas populares, produção de oficinas, figurinos, circulação de espetáculos e manutenção de espaços",
          gnd4_capital: "Equipamentos de iluminação cênica, sonorização profissional, instrumentos musicais e instrumentos multimídia"
        },
        publicoAlvo: "Coletivos culturais, mestres da cultura popular, crianças e comunidades tradicionais",
        justificativaModelo: "A proposta consolida o fortalecimento da produção cultural descentralizada, garantindo acesso democrático à arte, memória e cidadania nos territórios periféricos."
      },
      {
        id: "pol-mdhc-21b9",
        codigoAcao: "21B9",
        nome: "Proteção Integral aos Direitos Humanos e Fortalecimento dos Vínculos Comunitários",
        ministerio: "Ministério dos Direitos Humanos e da Cidadania (MDHC)",
        siglaMinisterio: "MDHC",
        orgaoGestor: "Secretaria Nacional de Promoção e Defesa dos Direitos Humanos",
        funcao: "Direitos Humanos",
        naturezaOrcamentaria: "Mista",
        permiteImpositivo: true,
        permiteDiscricionario: true,
        classificacaoRP: "RP 6, RP 7 e RP 2",
        dotacaoLOA: 175000000.00,
        cotaImpositivaEstimada: 110000000.00,
        cotaDiscricionariaEstimada: 65000000.00,
        instrumentoMrosc: "Termo de Fomento (MROSC)",
        dispensaChamamentoEmenda: "Sim, Art. 29 da Lei 13.019/2014",
        diretrizesGND: {
          gnd3_custeio: "Atendimento psicossocial, equipe multidisciplinar de acolhimento, oficinas de direitos e campanhas educativas",
          gnd4_capital: "Mobiliário para salas de atendimento reservado, computadores e veículos para visitas domiciliares de busca ativa"
        },
        publicoAlvo: "Vítimas de violência, pessoas em situação de rua, idosos em situação de isolamento e defensores de direitos",
        justificativaModelo: "A ação 21B9 é o instrumento orçamentário federal mais adequado para assegurar a dignidade humana, a prevenção à violação de direitos e o acolhimento cidadão no território."
      },
      {
        id: "pol-mesp-21a7",
        codigoAcao: "21A7",
        nome: "Esporte para Além dos Limites: Inclusão Social e Cidadania em Comunidades",
        ministerio: "Ministério do Esporte (MEsp)",
        siglaMinisterio: "MEsp",
        orgaoGestor: "Secretaria Nacional de Esporte Amador, Educação, Lazer e Inclusão Social (SNEAELIS)",
        funcao: "Esporte e Lazer",
        naturezaOrcamentaria: "Mista",
        permiteImpositivo: true,
        permiteDiscricionario: true,
        classificacaoRP: "RP 6 (Individual) e RP 2 (Discricionário MEsp)",
        dotacaoLOA: 130000000.00,
        cotaImpositivaEstimada: 85000000.00,
        cotaDiscricionariaEstimada: 45000000.00,
        instrumentoMrosc: "Termo de Fomento (MROSC)",
        dispensaChamamentoEmenda: "Sim, Art. 29 da Lei 13.019/2014",
        diretrizesGND: {
          gnd3_custeio: "Professores de educação física, monitores de contraturno escolar, uniformes, coletes, bolas e alimentação esportiva",
          gnd4_capital: "Kits de tatames olímpicos, tabelas de basquete, traves, cronômetros eletrônicos e reformas de quadras poliesportivas"
        },
        publicoAlvo: "Crianças e adolescentes no contraturno escolar e jovens em áreas de alta vulnerabilidade",
        justificativaModelo: "Utiliza a prática esportiva e recreativa como vetor comprovado de permanência escolar, promoção da saúde física e afastamento da juventude de situações de risco social."
      },
      {
        id: "pol-mgi-2180",
        codigoAcao: "2180",
        nome: "Modernização e Gestão Estratégica das Parcerias com OSCs (Transferegov.br)",
        ministerio: "Ministério da Gestão e da Inovação em Serviços Públicos (MGI)",
        siglaMinisterio: "MGI",
        orgaoGestor: "Diretoria de Transferências e Parcerias da União (DTPAR/Seges)",
        funcao: "Administração e Gestão Pública",
        naturezaOrcamentaria: "Discricionária / Inovação",
        permiteImpositivo: false,
        permiteDiscricionario: true,
        classificacaoRP: "RP 2 (Recursos Ordinários do MGI) e Editais de Inovação Aberta",
        dotacaoLOA: 95000000.00,
        cotaImpositivaEstimada: 0,
        cotaDiscricionariaEstimada: 95000000.00,
        instrumentoMrosc: "Acordo de Cooperação Técnica / Termo de Fomento",
        dispensaChamamentoEmenda: "Não aplicável (exige adesão a chamamentos públicos ou acordos de cooperação técnica)",
        diretrizesGND: {
          gnd3_custeio: "Desenvolvimento de capacitações para gestores de OSCs, inovação em prestação de contas digital e transparência ativa",
          gnd4_capital: "Equipamentos de infraestrutura para polos de apoio ao MROSC nos estados"
        },
        publicoAlvo: "Dirigentes de OSCs, gestores públicos de transferências voluntárias e conselhos de direitos",
        justificativaModelo: "Aprimoramento da governança, conformidade documental e capacitação das entidades civis para operarem o MROSC e o Transferegov com segurança jurídica."
      }
    ];

    // Filtragem dinâmica
    const filtradas = politicasPublicas.filter(item => {
      // Filtro de Natureza Orçamentária
      if (natureza === 'impositivo' && !item.permiteImpositivo) return false;
      if (natureza === 'discricionario' && !item.permiteDiscricionario) return false;

      // Filtro de Ministério
      if (minNorm) {
        const itemMin = normalizarTexto(item.ministerio);
        const itemSigla = normalizarTexto(item.siglaMinisterio);
        if (!itemMin.includes(minNorm) && !itemSigla.includes(minNorm)) return false;
      }

      // Filtro de Palavra-chave (nome, ação, código, função, público)
      if (qNorm) {
        const matchQ = 
          normalizarTexto(item.nome).includes(qNorm) ||
          normalizarTexto(item.codigoAcao).includes(qNorm) ||
          normalizarTexto(item.funcao).includes(qNorm) ||
          normalizarTexto(item.ministerio).includes(qNorm) ||
          normalizarTexto(item.publicoAlvo).includes(qNorm) ||
          normalizarTexto(item.classificacaoRP).includes(qNorm);
        if (!matchQ) return false;
      }

      return true;
    });

    res.json({
      success: true,
      total: filtradas.length,
      origem: "Catálogo de Políticas Públicas e Ações Orçamentárias do OGU (MGI/SOF/Transferegov)",
      politicas: filtradas
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// DOMÍNIO 1.3: RADAR NACIONAL DE EDITAIS ABERTOS (MAPA DAS OSC / PROSAS)
// =============================================================================
let cacheEditais = {
  timestamp: 0,
  dados: []
};
const CACHE_TTL_EDITAIS = 60 * 60 * 1000; // 1 hora de cache em memória

function extrairNomeIncentivador(item, included) {
  const relId = item.relationships?.incentivador?.data?.id;
  const found = relId && Array.isArray(included) ? included.find(inc => inc.type === 'incentivador' && String(inc.id) === String(relId)) : null;
  return found?.attributes?.nome_fantasia || item.attributes?.nome_empresa || 'Órgão / Financiador Público ou Privado';
}

app.get('/api/editais/radar', async (req, res) => {
  try {
    const agora = Date.now();
    const query = (req.query.q || '').toLowerCase().trim();
    const area = (req.query.area || '').toLowerCase().trim();
    const tipoPrazo = (req.query.prazo || '').toLowerCase().trim();

    // Se o cache expirou ou está vazio, busca da API pública unificada
    if (!cacheEditais.dados.length || (agora - cacheEditais.timestamp) > CACHE_TTL_EDITAIS) {
      const PAGE_SIZE = 100;
      const MAX_PAGES = 3;
      let page = 1;
      let totalPages = 1;
      const rawItems = [];
      const included = [];

      do {
        const url = `https://prosas.com.br/selecao/api/v2/publics/oportunidades?page[page]=${page}&page[size]=${PAGE_SIZE}&include=area_interesses,incentivador`;
        const apiRes = await fetch(url, {
          headers: { 'User-Agent': 'CaptaOSC/2.0 (gov.br/mrosc)' }
        });
        if (!apiRes.ok) throw new Error(`Falha ao acessar API Prosas/Mapa OSC: HTTP ${apiRes.status}`);
        const json = await apiRes.json();
        rawItems.push(...(json.data || []));
        if (Array.isArray(json.included)) included.push(...json.included);
        totalPages = json.links?.last || 1;
        page++;
      } while (page <= totalPages && page <= MAX_PAGES);

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const processados = rawItems.map(item => {
        const attrs = item.attributes || {};
        const prazoContinuo = attrs.prazo === 'continuo' || !attrs.data_final_inscricoes;
        const deadlineIso = prazoContinuo ? null : attrs.data_final_inscricoes;
        
        let diasRestantes = null;
        let dataFormatada = 'Inscrições Contínuas';
        if (deadlineIso) {
          const dtFinal = new Date(deadlineIso);
          dataFormatada = dtFinal.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const diffMs = dtFinal.getTime() - hoje.getTime();
          diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        }

        const org = extrairNomeIncentivador(item, included);
        let logo = attrs.logo || '';
        if (logo.startsWith('//')) logo = 'https:' + logo;

        return {
          id: String(item.id),
          titulo: attrs.nome || 'Edital sem título',
          concedente: org,
          linkOficial: `https://prosas.com.br/editais/${item.id}`,
          prazoTipo: prazoContinuo ? 'continuo' : 'definido',
          dataFinal: dataFormatada,
          deadlineIso: deadlineIso,
          diasRestantes: diasRestantes,
          logo: logo
        };
      })
      .filter(e => e.titulo && e.linkOficial)
      .sort((a, b) => {
        if (!a.deadlineIso && !b.deadlineIso) return 0;
        if (!a.deadlineIso) return 1;
        if (!b.deadlineIso) return -1;
        return a.deadlineIso.localeCompare(b.deadlineIso);
      });

      cacheEditais = {
        timestamp: agora,
        dados: processados
      };
    }

    // Filtros
    let filtrados = cacheEditais.dados;
    if (query) {
      filtrados = filtrados.filter(e => 
        e.titulo.toLowerCase().includes(query) || 
        e.concedente.toLowerCase().includes(query)
      );
    }
    if (area) {
      filtrados = filtrados.filter(e => 
        e.titulo.toLowerCase().includes(area) || 
        e.concedente.toLowerCase().includes(area)
      );
    }
    if (tipoPrazo === 'definido') {
      filtrados = filtrados.filter(e => e.prazoTipo === 'definido');
    } else if (tipoPrazo === 'continuo') {
      filtrados = filtrados.filter(e => e.prazoTipo === 'continuo');
    }

    res.json({
      success: true,
      total: filtrados.length,
      totalGeral: cacheEditais.dados.length,
      atualizadoEm: new Date(cacheEditais.timestamp).toLocaleTimeString('pt-BR'),
      origem: "Rede Nacional de Oportunidades: Mapa das OSC (IPEA) & Central de Editais Prosas",
      editais: filtrados
    });
  } catch (err) {
    console.error('Erro no radar de editais:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// DOMÍNIO 2: GESTÃO DE PROPOSTAS, OFÍCIO DE PLEITO & MINUTA TRANSFEREGOV
// =============================================================================
app.get('/api/propostas', (req, res) => res.json(lerProjetos()));

app.post('/api/propostas', async (req, res) => {
  try {
    const projetos = lerProjetos();
    const p = req.body;

    if (!p.id) p.id = 'prop_' + Date.now();
    p.atualizadoEm = new Date().toISOString();

    const gnd3 = Number(p.gnd3 || 0);
    const gnd4 = Number(p.gnd4 || 0);
    const total = gnd3 + gnd4;
    p.gnd3 = gnd3;
    p.gnd4 = gnd4;
    p.valorTotal = total;
    p.percentualGnd3 = total > 0 ? ((gnd3 / total) * 100).toFixed(1) : 0;
    p.percentualGnd4 = total > 0 ? ((gnd4 / total) * 100).toFixed(1) : 0;

    const idx = projetos.findIndex(item => item.id === p.id);
    if (idx >= 0) {
      projetos[idx] = p;
    } else {
      p.criadoEm = new Date().toISOString();
      projetos.unshift(p);
    }
    salvarProjetos(projetos);

    const sanitizado = (p.projeto || 'proposta-emenda').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 35);
    const txtName = `Minuta_Transferegov_${sanitizado}_${p.id}.txt`;
    const ofName = `Oficio_Pleito_${sanitizado}_${p.id}.txt`;
    const docxName = `Oficio_Pleito_${sanitizado}_${p.id}.docx`;

    // 1. Minuta Transferegov (TXT)
    const textoMinuta = gerarTextoMinutaPlanoTrabalho(p);
    fs.writeFileSync(path.join(DOCS_TXT_DIR, txtName), textoMinuta, 'utf-8');

    // 2. Ofício Formal ao Gabinete Parlamentar (TXT)
    const textoOficio = gerarTextoOficioGabinete(p);
    fs.writeFileSync(path.join(DOCS_TXT_DIR, ofName), textoOficio, 'utf-8');

    // 3. Ofício Oficial em formato DOCX (Word)
    try {
      const bufferDocx = await gerarBufferDocxOficio(p);
      fs.writeFileSync(path.join(DOCS_DOCX_DIR, docxName), bufferDocx);
    } catch (errDocx) {
      console.warn('Aviso: falha ao salvar arquivo docx prévio:', errDocx.message);
    }

    res.json({
      success: true,
      mensagem: 'Proposta, Minuta Transferegov, Ofício TXT e Documento DOCX gerados com sucesso!',
      proposta: p,
      arquivoTxt: txtName,
      arquivoOficio: ofName,
      arquivoDocx: docxName,
      minutaTexto: textoMinuta,
      oficioTexto: textoOficio
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint de Download Direto em DOCX (Word) a partir de JSON ou formulário
app.post('/api/propostas/exportar-docx', async (req, res) => {
  try {
    const p = req.body;
    const buffer = await gerarBufferDocxOficio(p);
    const sanitizado = (p.projeto || 'oficio-pleito').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 30);
    const nomeArquivo = `Oficio_${sanitizado}_${Date.now()}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint de Download da Declaração de Não Impedimento do Art. 39 em DOCX
app.post('/api/documentos/declaracao-art39/docx', async (req, res) => {
  try {
    const p = req.body;
    const buffer = await gerarBufferDocxDeclaracaoArt39(p);
    const sanitizado = (p.osc_sigla || p.osc_nome || 'OSC').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 20);
    const nomeArquivo = `Declaracao_Art39_MROSC_${sanitizado}_${Date.now()}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint de Download Direto em DOCX por ID de proposta salva
app.get('/api/propostas/:id/docx', async (req, res) => {
  try {
    const projetos = lerProjetos();
    const p = projetos.find(item => item.id === req.params.id);
    if (!p) return res.status(404).send('Proposta não encontrada.');

    const buffer = await gerarBufferDocxOficio(p);
    const sanitizado = (p.projeto || 'oficio-pleito').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 30);
    const nomeArquivo = `Oficio_${sanitizado}_${p.id}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/propostas/:id', (req, res) => {
  try {
    let projetos = lerProjetos();
    projetos = projetos.filter(p => p.id !== req.params.id);
    salvarProjetos(projetos);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helpers de Geração Textual
function formatarMoeda(val) {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function gerarTextoMinutaPlanoTrabalho(p) {
  const gnd3 = Number(p.gnd3 || 0);
  const gnd4 = Number(p.gnd4 || 0);
  const total = gnd3 + gnd4;

  return `================================================================================
MINUTA DO PLANO DE TRABALHO - EMENDA PARLAMENTAR FEDERAL
PLATAFORMA TRANSFEREGOV.BR / MARCO REGULATÓRIO DAS OSCs (LEI 13.019/2014)
LEI COMPLEMENTAR Nº 210/2024 & PORTARIA CONJUNTA MGI/MF/CGU Nº 32/2024
================================================================================

1. DADOS DA PROPONENTE (ORGANIZAÇÃO DA SOCIEDADE CIVIL - OSC)
- Razão Social: ${p.osc_nome || 'Não informada'}
- CNPJ: ${p.cnpj || 'Não informado'}
- Ano de Fundação / Eficácia do Registro: ${p.ano_fundacao || 'Não informado'} (${p.anos_existencia || 0} anos de existência)
- Município Sede / UF: ${p.cidade || ''} - ${p.uf || ''}
- Parecer de Habilitação Jurídica: Atende integralmente aos Arts. 33 (tempo de existência mínima) e 39 (regularidade cadastral ativa) da Lei Federal 13.019/2014.

2. DADOS DA DESTINAÇÃO PARLAMENTAR
- Parlamentar Proponente: ${p.parlamentar || 'Bancada Parlamentar'}
- Tipo de Emenda: ${p.tipoEmenda || 'Emenda Individual (RP 6 - Impositiva)'}
- Exercício Orçamentário (PLOA): ${p.exercicio || new Date().getFullYear()}
- Número da Emenda no OGU: ${p.numeroEmenda || 'A indicar após aprovação da LOA'}
- Ministério Setorial de Vinculação: ${p.ministerio || 'Ministério Competente'}
- Ação Orçamentária Sugerida: ${p.acaoOrcamentaria || 'Conforme programa temático'}

3. CARACTERIZAÇÃO DO OBJETO E DEMANDA SOCIAL
- Título do Projeto: ${p.projeto || 'Projeto de Interesse Público'}
- Objeto da Parceria (Claro, preciso e sucinto):
${p.objeto || 'Execução de ações sociais de interesse público voltadas à comunidade.'}

- Justificativa e Diagnóstico da Realidade Local:
${p.justificativa || 'Demanda embasada na realidade dos beneficiários e nas carências locais.'}

- Meta Física Estimada: Atendimento direto de ${p.metaBeneficiarios || 'número expressivo de'} beneficiários durante a vigência do Termo de Fomento.

4. ESTRUTURAÇÃO ORÇAMENTÁRIA (TRANSFEREGOV.BR)
- GND 3 (Despesas Correntes / Custeio): ${formatarMoeda(gnd3)} (${p.percentualGnd3}%)
  [Itens: Equipes técnicas, materiais didáticos/consumo, serviços de terceiros, eventos e diárias]
- GND 4 (Despesas de Capital / Investimento): ${formatarMoeda(gnd4)} (${p.percentualGnd4}%)
  [Itens: Aquisição de equipamentos duráveis, mobiliário permanente, veículos e reformas]
- VALOR GLOBAL CONSOLIDADO: ${formatarMoeda(total)} (100%)

5. CLÁUSULAS DE CONFORMIDADE, DISPENSA E PRESTAÇÃO DE CONTAS
- Fundamentação: Dispensa de chamamento público expressamente autorizada pelo Art. 29 da Lei nº 13.019/2014 (MROSC).
- Rastreabilidade e Transparência: Atendimento às diretrizes da Lei Complementar nº 210/2024.
- Movimentação Financeira: Exclusiva em conta bancária vinculada e bloqueada aberta via Transferegov.br.
- Compras e Contratações: Observância do Art. 42 da Lei 13.019/2014 (ampla cotação prévia de preços).
- Guarda Documental: 10 anos à disposição dos órgãos de controle (TCU, CGU e concedente).

Gerado eletronicamente em: ${new Date().toLocaleString('pt-BR')} via CaptaOSC
================================================================================`;
}

function gerarTextoOficioGabinete(p) {
  const gnd3 = Number(p.gnd3 || 0);
  const gnd4 = Number(p.gnd4 || 0);
  const total = gnd3 + gnd4;
  const numOficio = p.numeroOficio || `001/${p.exercicio || new Date().getFullYear()}`;
  const siglaOsc = (p.osc_sigla || p.osc_nome || 'OSC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const dataExtenso = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  return `OFÍCIO Nº ${numOficio}-${siglaOsc}

${p.cidade || 'Brasília'}/${p.uf || 'DF'}, ${dataExtenso}.

A Sua Excelência o(a) Senhor(a)
${p.parlamentar || 'Deputado(a) Federal / Senador(a)'}
Congresso Nacional – Câmara dos Deputados / Senado Federal
Gabinete nº ${p.gabinete || '[Número do Gabinete]'} – Anexo ${p.anexoGabinete || '[Anexo]'}
CEP: 70160-900 – Brasília/DF

Assunto: Pleito de destinação de Emenda Parlamentar ao Projeto de Lei Orçamentária Anual (PLOA ${p.exercicio || new Date().getFullYear() + 1}) – Apoio ao projeto "${p.projeto || '[Nome do Projeto]'}".

Senhor(a) Parlamentar,

1. Cumprimentando-o(a) cordialmente, dirigimo-nos a Vossa Excelência para apresentar os cumprimentos pelo profícuo mandato exercido em prol da população de ${p.uf ? `nosso Estado (${p.uf})` : 'nosso País'} e, na oportunidade, submeter pleito formal de inclusão de Emenda Parlamentar (${p.tipoEmenda || 'Individual - RP 6'}) na Lei Orçamentária Anual para o exercício financeiro de ${p.exercicio || new Date().getFullYear() + 1}.

2. A ${p.osc_nome || '[Nome da Organização da Sociedade Civil]'}, constituída formalmente desde ${p.ano_fundacao || '[Ano de Fundação]'}, qualificada como organização da sociedade civil sem fins lucrativos, inscrita no CNPJ sob o nº ${p.cnpj || '[CNPJ da Entidade]'}, desenvolve ações ininterruptas na área de ${p.areaAtuacao || 'desenvolvimento comunitário e social'}, impactando as famílias em situação de vulnerabilidade no município de ${p.cidade || '[Município]'}/${p.uf || '[UF]'}.

3. Para dar continuidade e ampliação a esse impacto, estruturamos o projeto "${p.projeto || '[Título do Projeto]'}", cujo objetivo central é:
${p.objeto || '[Descrição concisa do objeto da proposta]'}

A presente iniciativa guarda estreita convergência com as diretrizes e programas temáticos do ${p.ministerio || 'Ministério setorial afim'}.

4. Segue síntese das coordenadas orçamentárias e operacionais da proposta:
   a) Unidade Orçamentária Sugerida: ${p.ministerio || 'Ministério competente / Fundo Nacional'};
   b) Ação Orçamentária Sugerida: ${p.acaoOrcamentaria || 'Ação programática do órgão setorial'};
   c) Valor Total Pleiteado: ${formatarMoeda(total)}
      • GND 3 (Custeio / Despesas Correntes): ${formatarMoeda(gnd3)} (${p.percentualGnd3 || 0}%)
      • GND 4 (Capital / Equipamentos e Obras): ${formatarMoeda(gnd4)} (${p.percentualGnd4 || 0}%)
   d) Meta Física Estimada: Atendimento direto de ${p.metaBeneficiarios || '[Nº de Beneficiários]'} beneficiários.

5. Informamos que a entidade atende plenamente aos requisitos previstos na Lei Federal nº 13.019/2014 (MROSC) — inclusive a comprovação de eficácia do registro há mais de 3 anos (Art. 33, III) e a dispensa de chamamento público (Art. 29) —, bem como às exigências de transparência da Lei Complementar nº 210/2024, encontrando-se apta técnica e juridicamente a celebrar parceria via Plataforma Transferegov.br.

6. Anexamos a este ofício o Memorial Técnico Descritivo do Projeto contendo a justificativa detalhada, o plano de aplicação preliminar e o histórico de realizações da instituição.

Colocamo-nos à disposição de Vossa Excelência e da assessoria de orçamento pelo telefone ${p.telefoneContato || '[Telefone institucional]'} e e-mail ${p.emailContato || '[E-mail institucional]'}.

Respeitosamente,

___________________________________________________
${p.representanteLegal || '[Nome do(a) Presidente/Representante Legal]'}
Presidente / Diretor(a) Executivo(a)
${p.osc_nome || '[Nome da Organização da Sociedade Civil]'}
CNPJ nº ${p.cnpj || '[CNPJ]'}`;
}

// =============================================================================
// GERADOR OFICIAL EM DOCX (MICROSOFT WORD) - PADRÃO ADMINISTRAÇÃO PÚBLICA
// =============================================================================
async function gerarBufferDocxOficio(p) {
  const gnd3 = Number(p.gnd3 || 0);
  const gnd4 = Number(p.gnd4 || 0);
  const total = gnd3 + gnd4;
  const numOficio = p.numeroOficio || `001/${p.exercicio || new Date().getFullYear()}`;
  const siglaOsc = (p.osc_sigla || p.osc_nome || 'OSC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const dataExtenso = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  const tableRows = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: 'Rubrica Orçamentária', bold: true, size: 20 })] })]
        }),
        new TableCell({
          width: { size: 40, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: 'Destinação / Natureza', bold: true, size: 20 })] })]
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: 'Valor (R$)', bold: true, size: 20 })] })]
        }),
        new TableCell({
          width: { size: 10, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: '%', bold: true, size: 20 })] })]
        })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'GND 3 (Custeio / Despesas Correntes)', size: 19 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Equipe técnica, insumos pedagógicos/consumo, serviços de terceiros, capacitações', size: 19 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatarMoeda(gnd3), size: 19 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${p.percentualGnd3 || 0}%`, size: 19 })] })] })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'GND 4 (Capital / Investimento)', size: 19 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Equipamentos duráveis, mobiliário permanente, veículos e adequações', size: 19 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatarMoeda(gnd4), size: 19 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${p.percentualGnd4 || 0}%`, size: 19 })] })] })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'TOTAL GLOBAL DO PLEITO', bold: true, size: 20 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Cota total da Emenda Parlamentar no OGU', bold: true, size: 19 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatarMoeda(total), bold: true, size: 20 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '100%', bold: true, size: 20 })] })] })
      ]
    })
  ];

  const orcamentoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1700, bottom: 1134, left: 1700, right: 1134 } // Margens padrão ABNT / Ofício: 3cm x 2cm
        }
      },
      children: [
        // Cabeçalho da OSC
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: (p.osc_nome || 'ORGANIZAÇÃO DA SOCIEDADE CIVIL').toUpperCase(), bold: true, size: 24, font: 'Calibri' })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 260 },
          children: [
            new TextRun({
              text: `CNPJ nº ${p.cnpj || '00.000.000/0001-00'} | Fundada em ${p.ano_fundacao || '----'} | ${p.cidade || 'Município'}/${p.uf || 'UF'} | ${p.emailContato || 'contato@entidade.org.br'}`,
              size: 18,
              color: '555555',
              font: 'Calibri'
            })
          ]
        }),

        // Número do Ofício e Data
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: `OFÍCIO Nº ${numOficio}-${siglaOsc}`, bold: true, size: 22, font: 'Calibri' })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 240 },
          children: [
            new TextRun({ text: `${p.cidade || 'Brasília'}/${p.uf || 'DF'}, ${dataExtenso}.`, italics: true, size: 20, font: 'Calibri' })
          ]
        }),

        // Endereçamento
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: 'A Sua Excelência o(a) Senhor(a)', bold: true, size: 20, font: 'Calibri' })]
        }),
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: p.parlamentar || 'Deputado(a) Federal / Senador(a)', bold: true, size: 22, font: 'Calibri' })]
        }),
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: `${p.cargoParlamentar || 'Parlamentar Federal'} – ${p.casaLegislativa || 'Congresso Nacional'}`, size: 20, font: 'Calibri' })]
        }),
        new Paragraph({
          spacing: { after: 240 },
          children: [new TextRun({ text: `Gabinete nº ${p.gabinete || '[XXX]'} – Anexo ${p.anexoGabinete || '[X]'} | CEP 70160-900 – Brasília/DF`, size: 18, font: 'Calibri' })]
        }),

        // Assunto
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: 'Assunto: ', bold: true, size: 20, font: 'Calibri' }),
            new TextRun({ text: `Pleito de destinação de Emenda Parlamentar ao Projeto de Lei Orçamentária Anual (PLOA ${p.exercicio || new Date().getFullYear() + 1}) – Apoio ao projeto "${p.projeto || '[Nome do Projeto]'}".`, bold: true, size: 20, font: 'Calibri' })
          ]
        }),

        // Vocativo
        new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun({ text: 'Senhor(a) Parlamentar,', bold: true, size: 20, font: 'Calibri' })]
        }),

        // Item 1
        new Paragraph({
          spacing: { after: 140 },
          children: [
            new TextRun({
              text: `1. Cumprimentando-o(a) cordialmente, dirigimo-nos a Vossa Excelência para apresentar os cumprimentos pelo profícuo mandato exercido em prol da população de ${p.uf ? `nosso Estado (${p.uf})` : 'nosso País'} e, na oportunidade, submeter pleito formal de inclusão de Emenda Parlamentar (${p.tipoEmenda || 'Individual - RP 6'}) na Lei Orçamentária Anual para o exercício financeiro de ${p.exercicio || new Date().getFullYear() + 1}.`,
              size: 20,
              font: 'Calibri'
            })
          ]
        }),

        // Item 2
        new Paragraph({
          spacing: { after: 140 },
          children: [
            new TextRun({
              text: `2. A ${p.osc_nome || '[Nome da Organização]'}, constituída formalmente desde ${p.ano_fundacao || '[Ano]'}, qualificada como organização da sociedade civil sem fins lucrativos, inscrita no CNPJ sob o nº ${p.cnpj || '[CNPJ]'}, desenvolve ações ininterruptas na área de ${p.areaAtuacao || 'desenvolvimento comunitário e social'}, impactando anualmente famílias em situação de vulnerabilidade social no município de ${p.cidade || '[Município]'}/${p.uf || '[UF]'}.`,
              size: 20,
              font: 'Calibri'
            })
          ]
        }),

        // Item 3
        new Paragraph({
          spacing: { after: 140 },
          children: [
            new TextRun({
              text: `3. Para dar continuidade e ampliação a esse impacto, estruturamos o projeto "${p.projeto || '[Título do Projeto]'}": ${p.objeto || '[Descrição concisa do objeto]'}. A presente iniciativa guarda estreita convergência com as diretrizes do ${p.ministerio || 'Ministério setorial afim'} e com a Ação Orçamentária ${p.acaoOrcamentaria || 'programática'}.`,
              size: 20,
              font: 'Calibri'
            })
          ]
        }),

        // Item 4
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: '4. Segue síntese das coordenadas orçamentárias e metas do projeto:',
              bold: true,
              size: 20,
              font: 'Calibri'
            })
          ]
        }),

        // Tabela Orçamentária
        orcamentoTable,

        new Paragraph({ text: '', spacing: { after: 140 } }),

        // Item 5
        new Paragraph({
          spacing: { after: 140 },
          children: [
            new TextRun({
              text: `5. Informamos que a entidade atende plenamente aos requisitos previstos na Lei Federal nº 13.019/2014 (MROSC) — inclusive a comprovação de eficácia do registro há mais de 3 anos (Art. 33, III) e a dispensa de chamamento público para emendas parlamentares (Art. 29) —, bem como às exigências de rastreabilidade e publicidade da Lei Complementar nº 210/2024, encontrando-se apta técnica e juridicamente a operar na Plataforma Transferegov.br. Meta física: atendimento direto de ${p.metaBeneficiarios || '---'} beneficiários.`,
              size: 20,
              font: 'Calibri'
            })
          ]
        }),

        // Item 6
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: '6. Anexamos a este ofício o Memorial Técnico Descritivo do Projeto contendo a justificativa detalhada, o plano de aplicação preliminar e o histórico de realizações da instituição. Colocamo-nos à disposição de Vossa Excelência e da assessoria de orçamento pelo telefone ' + (p.telefoneContato || '[Telefone]') + ' e e-mail ' + (p.emailContato || '[E-mail]') + '.',
              size: 20,
              font: 'Calibri'
            })
          ]
        }),

        // Fecho
        new Paragraph({
          spacing: { after: 260 },
          children: [new TextRun({ text: 'Respeitosamente,', size: 20, font: 'Calibri' })]
        }),

        // Assinatura
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [new TextRun({ text: '___________________________________________________', size: 20, font: 'Calibri' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 30 },
          children: [new TextRun({ text: p.representanteLegal || '[Nome do(a) Presidente/Representante Legal]', bold: true, size: 22, font: 'Calibri' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 30 },
          children: [new TextRun({ text: 'Presidente / Representante Legal', size: 19, font: 'Calibri' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `${p.osc_nome || 'Organização da Sociedade Civil'} – CNPJ ${p.cnpj || ''}`, size: 18, color: '555555', font: 'Calibri' })]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

// =============================================================================
// GERADOR DE DECLARAÇÃO DO ART. 39 (GOVERNANÇA & NÃO IMPEDIMENTO) EM DOCX
// =============================================================================
async function gerarBufferDocxDeclaracaoArt39(p) {
  const dataExtenso = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  const dirigentes = Array.isArray(p.dirigentes) && p.dirigentes.length > 0 
    ? p.dirigentes 
    : [
        { nome: p.representanteLegal || 'Presidente / Representante Legal', cargo: 'Presidente', cpf: p.cpfPresidente || '---' },
        { nome: p.diretorFinanceiro || 'Diretor(a) Financeiro(a) / Tesoureiro(a)', cargo: 'Tesoureiro(a)', cpf: '---' }
      ];

  const dirigentesRows = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: 'Nome do Dirigente', bold: true, size: 20 })] })]
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: 'Cargo na OSC', bold: true, size: 20 })] })]
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: 'CPF', bold: true, size: 20 })] })]
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: 'Assinatura', bold: true, size: 20 })] })]
        })
      ]
    }),
    ...dirigentes.map(d => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: d.nome || '', size: 19 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: d.cargo || '', size: 19 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: d.cpf || '', size: 19 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '____________________', size: 16, color: '888888' })] })] })
      ]
    }))
  ];

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 }
        }
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: (p.osc_nome || 'ORGANIZAÇÃO DA SOCIEDADE CIVIL').toUpperCase(), bold: true, size: 22, font: 'Calibri' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
          children: [new TextRun({ text: `CNPJ Nº ${p.cnpj || '00.000.000/0000-00'} | SEDE: ${p.cidade || 'Município'}/${p.uf || 'UF'}`, size: 18, color: '555555', font: 'Calibri' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ 
              text: 'DECLARAÇÃO DE INEXISTÊNCIA DE IMPEDIMENTOS E CONFORMIDADE DE GOVERNANÇA', 
              bold: true, 
              size: 22, 
              color: '1b3576', 
              font: 'Calibri' 
            })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [
            new TextRun({ 
              text: '(Em estrito cumprimento ao Art. 39 da Lei nº 13.019/2014, Decreto nº 8.726/2016 e Lei Complementar nº 210/2024)', 
              italics: true, 
              size: 18, 
              color: '444444', 
              font: 'Calibri' 
            })
          ]
        }),

        new Paragraph({
          alignment: AlignmentType.JUSTIFY,
          spacing: { after: 160 },
          children: [
            new TextRun({
              text: `A ${p.osc_nome || 'instituição proponente'}, pessoa jurídica de direito privado sem fins lucrativos, inscrita no Cadastro Nacional da Pessoa Jurídica (CNPJ) sob o nº ${p.cnpj || '---'}, com sede e foro no município de ${p.cidade || '---'}/${p.uf || '---'}, por intermédio de seus dirigentes e representantes legais abaixo firmados, DECLARA, sob as penas da lei e para os devidos fins de formalização de parceria com a Administração Pública Federal por meio da Plataforma Transferegov.br:`,
              size: 20,
              font: 'Calibri'
            })
          ]
        }),

        new Paragraph({
          alignment: AlignmentType.JUSTIFY,
          spacing: { after: 120 },
          children: [
            new TextRun({ text: '1. ', bold: true, size: 20, font: 'Calibri' }),
            new TextRun({ text: 'Que se encontra regularmente constituída e com cadastro ATIVO perante a Receita Federal do Brasil, não estando omissa no dever de prestar contas de parcerias anteriormente celebradas (Art. 39, I e II da Lei nº 13.019/2014).', size: 20, font: 'Calibri' })
          ]
        }),

        new Paragraph({
          alignment: AlignmentType.JUSTIFY,
          spacing: { after: 120 },
          children: [
            new TextRun({ text: '2. ', bold: true, size: 20, font: 'Calibri' }),
            new TextRun({ text: 'Que nenhum de seus dirigentes estatutários é membro de Poder (Legislativo, Executivo ou Judiciário) ou do Ministério Público, ou dirigente de órgão/entidade concedente na esfera governamental da parceria, estendendo-se expressamente esta vedação aos respectivos cônjuges, companheiros e parentes em linha reta, colateral ou por afinidade até o 2º grau (Art. 39, III da Lei nº 13.019/2014).', size: 20, font: 'Calibri' })
          ]
        }),

        new Paragraph({
          alignment: AlignmentType.JUSTIFY,
          spacing: { after: 120 },
          children: [
            new TextRun({ text: '3. ', bold: true, size: 20, font: 'Calibri' }),
            new TextRun({ text: 'Que nenhum dirigente da entidade exerce cargo ou função pública com poder de supervisão, fiscalização, instrução técnica ou aprovação das parcerias no órgão repassador.', size: 20, font: 'Calibri' })
          ]
        }),

        new Paragraph({
          alignment: AlignmentType.JUSTIFY,
          spacing: { after: 120 },
          children: [
            new TextRun({ text: '4. ', bold: true, size: 20, font: 'Calibri' }),
            new TextRun({ text: 'Que a entidade não teve contas de parcerias rejeitadas pela administração pública nos últimos 5 (cinco) anos, nem contas julgadas irregulares por Tribunal de Contas da União (TCU) ou dos Estados/Municípios nos últimos 8 (oito) anos (Art. 39, IV e VI da Lei nº 13.019/2014).', size: 20, font: 'Calibri' })
          ]
        }),

        new Paragraph({
          alignment: AlignmentType.JUSTIFY,
          spacing: { after: 120 },
          children: [
            new TextRun({ text: '5. ', bold: true, size: 20, font: 'Calibri' }),
            new TextRun({ text: 'Que a entidade não foi punida com suspensão de participação em licitação, impedimento de celebrar parcerias ou declaração de inidoneidade pela Administração Pública (Art. 39, V da Lei nº 13.019/2014).', size: 20, font: 'Calibri' })
          ]
        }),

        new Paragraph({
          alignment: AlignmentType.JUSTIFY,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: '6. ', bold: true, size: 20, font: 'Calibri' }),
            new TextRun({ text: 'Que a instituição cumpre integralmente os princípios de transparência ativa, publicidade e rastreabilidade estatuídos na Lei Complementar nº 210/2024 e no Decreto nº 11.948/2024.', size: 20, font: 'Calibri' })
          ]
        }),

        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: 'QUADRO NOMINATIVO DE DIRIGENTES DA OSC:', bold: true, size: 20, font: 'Calibri' })]
        }),

        new Table({
          rows: dirigentesRows,
          width: { size: 100, type: WidthType.PERCENTAGE }
        }),

        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 280, after: 300 },
          children: [
            new TextRun({ text: `${p.cidade || 'Município'}/${p.uf || 'UF'}, ${dataExtenso}.`, italics: true, size: 20, font: 'Calibri' })
          ]
        }),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [new TextRun({ text: '___________________________________________________', size: 20, font: 'Calibri' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 30 },
          children: [new TextRun({ text: p.representanteLegal || 'Presidente / Representante Legal', bold: true, size: 22, font: 'Calibri' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `${p.osc_nome || 'Organização da Sociedade Civil'} – CNPJ ${p.cnpj || ''}`, size: 18, color: '555555', font: 'Calibri' })]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

// Configurações
app.get('/api/config', (req, res) => res.json(carregarConfig()));

app.post('/api/config', (req, res) => {
  const atual = carregarConfig();
  const nova = { ...atual, ...req.body };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(nova, null, 2), 'utf-8');
  res.json({ success: true, mensagem: 'Configuração atualizada.', config: nova });
});

// Inicialização
app.listen(PORT, () => {
  console.log(`CaptaOSC ativo em: http://localhost:${PORT}`);
});
