// calc.js — motor de cálculo (Carnê-Leão/PF vs MEI vs Simples Nacional + Fator R).
// Usado tanto pelo index.html (via <script src="calc.js">) quanto pelo test_calc.js (via require),
// para garantir que o teste valida exatamente o código que roda no navegador (zero duplicação/drift).
//
// Contexto: a Reforma Tributária tornou a NFS-e Nacional obrigatória para autônomos PF desde
// 01/01/2026, e a partir de julho/2026 contribuintes de IBS/CBS (autônomos habituais) devem se
// inscrever no CNPJ (sem virar empresa). Esta calculadora decide entre 3 caminhos:
//   1) Continuar PF emitindo NFS-e (tributado via Carnê-Leão/IRPF)
//   2) Virar MEI (se a atividade permitir e o faturamento couber no limite)
//   3) Abrir Simples Nacional como ME (Anexo III/V + Fator R)
//
// Fontes das regras (conferidas em 2026-08-04):
// - NFS-e Nacional obrigatória para autônomo PF desde 1º/01/2026 — Ministério da Fazenda:
//   https://www.gov.br/fazenda/pt-br/assuntos/noticias/2025/agosto/a-partir-de-janeiro-de-2026-a-nota-fiscal-de-servico-eletronica-nfs-e-sera-obrigatoria-a-fim-de-simplificar-cotidiano-das-empresas
// - Inscrição no CNPJ a partir de julho/2026 para PF contribuintes de IBS/CBS (não caracteriza
//   abertura de empresa) — Dinastia Contábil: https://www.dinastiacontabil.com.br/cnpj-obrigatorio-autonomos-reforma-tributaria-2026/
//   e confirmação da obrigatoriedade desde 1º/01/2026 — ACINH:
//   https://www.acinh.com.br/noticia/emissao-de-nota-fiscal-de-servicos-por-profissionais-autonomos-e-prestadores-de-servicos-pessoas-fisicas-e-obrigatoria-a-partir-de-1o-de-janeiro-de-2026
// - Tabela progressiva mensal do IRPF 2026 (Lei 15.270/2025): mesmas faixas/deduções nominais
//   vigentes desde 2025, + redutor que isenta rendimento tributável mensal até R$ 5.000,00 e
//   aplica redução linear decrescente entre R$ 5.000,01 e R$ 7.350,00.
// - Limite de faturamento do MEI: R$ 81.000/ano (tolerância de 20% = R$ 97.200 no ano em que
//   ultrapassar, com DAS complementar sobre o excedente e obrigação de migrar no ano seguinte) —
//   valor estável desde 2018 (LC 123/2006 e alterações), sem mudança confirmada para 2026 até a
//   data de conferência (há PLPs em tramitação propondo aumento, não sancionados).
// - Valor do DAS-MEI 2026 (serviço): R$ 86,05/mês — INSS (5% do salário mínimo de R$ 1.621) + ISS
//   fixo (R$ 5,00), conforme tabelas de referência contábil consultadas em 2026-08-04.
// - Atividades vedadas ao MEI: profissões regulamentadas que exigem registro em conselho de
//   classe (medicina/CRM, advocacia/OAB, contabilidade/CRC, engenharia-arquitetura/CREA-CAU,
//   odontologia/CRO, psicologia/CRP, fisioterapia/CREFITO, corretagem de imóveis/seguros,
//   jornalismo/assessoria de imprensa) — Anexo XI da Resolução CGSN nº 140/2018:
//   https://www8.receita.fazenda.gov.br/simplesnacional/arquivos/manual/anexo_xi.pdf
// - Tabelas do Simples Nacional Anexo III e Anexo V (LC 123/2006 e alterações, valores nominais
//   estáveis desde 2018 — não têm correção anual automática por lei).
// - Fator R: Folha de pagamento (12 meses) / Receita Bruta (12 meses). >= 28% → Anexo III
//   (menor carga). < 28% → Anexo V. Aqui simplificado como "% do faturamento pago como
//   pró-labore", proxy comum usado por calculadoras do gênero — não substitui o cálculo oficial
//   da folha completa.

(function (root) {
  'use strict';

  // ---------- Carnê-Leão (IRPF 2026) ----------

  // Tabela progressiva mensal nominal (vigente desde 2025, mantida em 2026).
  var FAIXAS_IRPF = [
    { ate: 2428.80, aliq: 0,     deduz: 0 },
    { ate: 2826.65, aliq: 0.075, deduz: 182.16 },
    { ate: 3751.05, aliq: 0.15,  deduz: 394.16 },
    { ate: 4664.68, aliq: 0.225, deduz: 675.49 },
    { ate: Infinity, aliq: 0.275, deduz: 908.73 }
  ];

  function impostoTabelaNominal(rendimento) {
    for (var i = 0; i < FAIXAS_IRPF.length; i++) {
      if (rendimento <= FAIXAS_IRPF[i].ate) {
        var f = FAIXAS_IRPF[i];
        var v = rendimento * f.aliq - f.deduz;
        return Math.max(0, v);
      }
    }
    return 0;
  }

  // Redutor da Lei 15.270/2025: isenção plena até R$5.000, redução linear decrescente até R$7.350.
  var TETO_ISENCAO = 5000;
  var TETO_REDUTOR = 7350;

  function irpfMensal(rendimento) {
    rendimento = Math.max(0, rendimento || 0);
    if (rendimento <= TETO_ISENCAO) return 0;
    var imp = impostoTabelaNominal(rendimento);
    if (rendimento <= TETO_REDUTOR) {
      var redutor = Math.max(0, 978.62 - 0.133145 * rendimento);
      imp = Math.max(0, imp - redutor);
    }
    return imp;
  }

  function carneLeaoAnual(rendimentoMensal) {
    return irpfMensal(rendimentoMensal) * 12;
  }

  // ---------- MEI ----------

  var MEI_LIMITE_ANUAL = 81000;
  var MEI_LIMITE_TOLERANCIA = 97200; // +20%: permite fechar o ano como MEI (DAS complementar), mas exige migração no ano seguinte

  var DAS_MEI_SERVICO_MENSAL = 86.05; // 2026: INSS (5% do salário mínimo R$1.621) + ISS fixo

  // Profissões de referência (não é lista oficial exaustiva — checar CNAE real no Portal do
  // Empreendedor). "mei: false" = profissão regulamentada com conselho de classe, vedada ao MEI
  // pelo Anexo XI da Resolução CGSN 140/2018.
  var PROFISSOES = [
    { id: 'consultor-ti', label: 'Consultor(a)/desenvolvedor(a) de TI', mei: true },
    { id: 'designer', label: 'Designer/diagramador(a)', mei: true },
    { id: 'fotografo', label: 'Fotógrafo(a)/videomaker', mei: true },
    { id: 'redator', label: 'Redator(a)/copywriter/tradutor(a)', mei: true },
    { id: 'social-media', label: 'Social media/gestor(a) de tráfego', mei: true },
    { id: 'professor-particular', label: 'Professor(a) particular/tutor(a)', mei: true },
    { id: 'personal-trainer', label: 'Personal trainer/instrutor(a) de educação física', mei: true },
    { id: 'esteticista', label: 'Cabeleireiro(a)/manicure/esteticista', mei: true },
    { id: 'consultor-outros', label: 'Consultor(a) de negócios/marketing (não regulamentado)', mei: true },
    { id: 'advogado', label: 'Advogado(a)', mei: false },
    { id: 'contador', label: 'Contador(a)', mei: false },
    { id: 'medico', label: 'Médico(a)', mei: false },
    { id: 'dentista', label: 'Dentista', mei: false },
    { id: 'psicologo', label: 'Psicólogo(a)', mei: false },
    { id: 'fisioterapeuta', label: 'Fisioterapeuta', mei: false },
    { id: 'corretor-imoveis', label: 'Corretor(a) de imóveis/seguros', mei: false },
    { id: 'engenheiro', label: 'Engenheiro(a)/arquiteto(a)', mei: false },
    { id: 'jornalista', label: 'Jornalista/assessor(a) de imprensa', mei: false },
    { id: 'outro-nao-regulamentado', label: 'Outra atividade não regulamentada (provavelmente permite MEI)', mei: true },
    { id: 'outro-regulamentado', label: 'Outra profissão regulamentada (tem conselho de classe/OAB/CRM/CRC etc.)', mei: false }
  ];

  function profissaoPorId(id) {
    for (var i = 0; i < PROFISSOES.length; i++) {
      if (PROFISSOES[i].id === id) return PROFISSOES[i];
    }
    return { id: id || 'desconhecida', label: 'Não informado', mei: true };
  }

  // status: 'ok' (dentro do limite), 'tolerancia' (entre 81k e 97.2k — MEI neste ano, mas com
  // DAS complementar sobre o excedente e migração obrigatória no ano seguinte),
  // 'faturamento-excedido' (acima da tolerância) ou 'profissao-vedada'.
  function elegibilidadeMEI(profissaoId, faturamentoAnual) {
    faturamentoAnual = Math.max(0, faturamentoAnual || 0);
    var prof = profissaoPorId(profissaoId);
    if (!prof.mei) {
      return { elegivel: false, status: 'profissao-vedada' };
    }
    if (faturamentoAnual <= MEI_LIMITE_ANUAL) {
      return { elegivel: true, status: 'ok' };
    }
    if (faturamentoAnual <= MEI_LIMITE_TOLERANCIA) {
      return { elegivel: true, status: 'tolerancia' };
    }
    return { elegivel: false, status: 'faturamento-excedido' };
  }

  function custoMEIAnual(custoContabilidadeMensal) {
    custoContabilidadeMensal = Math.max(0, custoContabilidadeMensal || 0);
    return DAS_MEI_SERVICO_MENSAL * 12 + custoContabilidadeMensal * 12;
  }

  // ---------- Simples Nacional — Anexo III e Anexo V ----------

  var ANEXO_III = [
    { ate: 180000,   aliq: 0.06,  deduz: 0 },
    { ate: 360000,   aliq: 0.112, deduz: 9360 },
    { ate: 720000,   aliq: 0.135, deduz: 17640 },
    { ate: 1800000,  aliq: 0.16,  deduz: 35640 },
    { ate: 3600000,  aliq: 0.21,  deduz: 125640 },
    { ate: 4800000,  aliq: 0.33,  deduz: 648000 }
  ];

  var ANEXO_V = [
    { ate: 180000,   aliq: 0.155, deduz: 0 },
    { ate: 360000,   aliq: 0.18,  deduz: 4500 },
    { ate: 720000,   aliq: 0.195, deduz: 9900 },
    { ate: 1800000,  aliq: 0.205, deduz: 17100 },
    { ate: 3600000,  aliq: 0.23,  deduz: 62100 },
    { ate: 4800000,  aliq: 0.305, deduz: 540000 }
  ];

  function faixaSimples(tabela, rbt12) {
    for (var i = 0; i < tabela.length; i++) {
      if (rbt12 <= tabela[i].ate) return tabela[i];
    }
    return tabela[tabela.length - 1]; // acima de 4.8M: fora do Simples na prática; usa último degrau como teto conservador
  }

  function aliquotaEfetiva(rbt12, faixa) {
    if (rbt12 <= 0) return faixa.aliq;
    var v = (rbt12 * faixa.aliq - faixa.deduz) / rbt12;
    return Math.max(0, v);
  }

  var FATOR_R_CORTE = 0.28; // >= 28% => Anexo III

  function anexoPorFatorR(fatorRPercentual) {
    return (fatorRPercentual / 100) >= FATOR_R_CORTE ? 'III' : 'V';
  }

  function simplesAnual(faturamentoAnual, fatorRPercentual) {
    var anexo = anexoPorFatorR(fatorRPercentual);
    var tabela = anexo === 'III' ? ANEXO_III : ANEXO_V;
    var faixa = faixaSimples(tabela, faturamentoAnual);
    var aliqEf = aliquotaEfetiva(faturamentoAnual, faixa);
    var impostoAnual = faturamentoAnual * aliqEf;
    return { anexo: anexo, aliquotaNominal: faixa.aliq, aliquotaEfetiva: aliqEf, impostoAnual: impostoAnual };
  }

  // ---------- Comparação PF (Carnê-Leão) vs MEI vs Simples (Anexo III/V + Fator R) ----------

  function comparar(input) {
    input = input || {};
    var faturamentoMensalPF = Math.max(0, input.faturamentoMensalPF || 0);
    var profissaoId = input.profissaoId;
    var fatorRPercentual = input.fatorRPercentual != null ? input.fatorRPercentual : 28;
    var custoContabilidadeSimplesMensal = Math.max(0, input.custoContabilidadeSimplesMensal || 0);

    var faturamentoAnual = faturamentoMensalPF * 12;

    // 1) PF — Carnê-Leão
    var pf = { custoAnual: carneLeaoAnual(faturamentoMensalPF) };

    // 2) MEI
    var mei = elegibilidadeMEI(profissaoId, faturamentoAnual);
    mei.custoAnual = mei.elegivel ? custoMEIAnual(0) : null;

    // 3) Simples Nacional (Anexo III/V + Fator R)
    var simplesCalc = simplesAnual(faturamentoAnual, fatorRPercentual);
    var custoContabilidadeAnual = custoContabilidadeSimplesMensal * 12;
    var simples = {
      anexo: simplesCalc.anexo,
      aliquotaEfetiva: simplesCalc.aliquotaEfetiva,
      impostoAnual: simplesCalc.impostoAnual,
      custoContabilidadeAnual: custoContabilidadeAnual,
      custoAnual: simplesCalc.impostoAnual + custoContabilidadeAnual
    };

    // Recomendação: caminho elegível de menor custo anual.
    var candidatos = [{ caminho: 'pf', custoAnual: pf.custoAnual }];
    if (mei.elegivel) candidatos.push({ caminho: 'mei', custoAnual: mei.custoAnual });
    candidatos.push({ caminho: 'simples', custoAnual: simples.custoAnual });

    var recomendado = candidatos[0];
    for (var i = 1; i < candidatos.length; i++) {
      if (candidatos[i].custoAnual < recomendado.custoAnual) recomendado = candidatos[i];
    }

    var custoAtualPF = pf.custoAnual;
    var economiaAnual = custoAtualPF - recomendado.custoAnual;

    return {
      faturamentoAnual: faturamentoAnual,
      pf: pf,
      mei: mei,
      simples: simples,
      recomendacao: recomendado.caminho,
      custoRecomendadoAnual: recomendado.custoAnual,
      economiaVsPF: economiaAnual
    };
  }

  var API = {
    irpfMensal: irpfMensal,
    carneLeaoAnual: carneLeaoAnual,
    PROFISSOES: PROFISSOES,
    profissaoPorId: profissaoPorId,
    elegibilidadeMEI: elegibilidadeMEI,
    custoMEIAnual: custoMEIAnual,
    MEI_LIMITE_ANUAL: MEI_LIMITE_ANUAL,
    MEI_LIMITE_TOLERANCIA: MEI_LIMITE_TOLERANCIA,
    DAS_MEI_SERVICO_MENSAL: DAS_MEI_SERVICO_MENSAL,
    aliquotaEfetiva: aliquotaEfetiva,
    faixaSimples: faixaSimples,
    simplesAnual: simplesAnual,
    anexoPorFatorR: anexoPorFatorR,
    comparar: comparar,
    FATOR_R_CORTE: FATOR_R_CORTE,
    ANEXO_III: ANEXO_III,
    ANEXO_V: ANEXO_V
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    root.FRPA = API; // Fim do RPA
  }
})(typeof window !== 'undefined' ? window : this);
