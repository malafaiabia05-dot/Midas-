const statusGrafico = document.getElementById("status-grafico");
const canvasGrafico = document.getElementById("myChart");
const seletorPeriodo = document.getElementById("periodo-cotacoes");
const seletorMoeda = document.getElementById("moeda-cotacao");
const seletorDestino = document.getElementById("moeda-destino");
const campoConversor = document.getElementById("valor-conversor");
const rotuloConversor = document.getElementById("rotulo-conversor");
const resultadoConversor = document.getElementById("resultado-conversor");
let grafico;
let requisicaoAtual = 0;
let cotacaoAtual = null;

function dataDaCotacao(cotacao) {
    if (cotacao.create_date) {
        return cotacao.create_date.slice(0, 10);
    }

    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date(Number(cotacao.timestamp) * 1000));
    const partesData = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
    return `${partesData.year}-${partesData.month}-${partesData.day}`;
}

function formatarMoeda(valor, codigo) {
    try {
        return Number(valor).toLocaleString("pt-BR", {
            style: "currency",
            currency: codigo,
            maximumFractionDigits: 6
        });
    } catch (erro) {
        return `${Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} ${codigo}`;
    }
}

function atualizarConversor() {
    const quantidade = Number(campoConversor.value);
    const moedaOrigem = seletorMoeda.value;
    const moedaDestino = seletorDestino.value;

    if (!moedaOrigem || !moedaDestino || cotacaoAtual === null ||
        !Number.isFinite(quantidade) || quantidade < 0) {
        resultadoConversor.textContent = "Selecione as moedas e informe uma quantidade válida.";
        return;
    }

    resultadoConversor.textContent =
        `${quantidade.toLocaleString("pt-BR")} ${moedaOrigem} = ` +
        formatarMoeda(quantidade * cotacaoAtual, moedaDestino);
}

function taxaMediaParaDolar(cotacao, moeda) {
    const media = (Number(cotacao.bid) + Number(cotacao.ask)) / 2;
    const codigoBase = cotacao.code || moeda.par.split("-")[0];

    if (codigoBase === moeda.codigo) {
        return media;
    }
    return 1 / media;
}

function taxaNaData(serie, data) {
    for (let indice = serie.length - 1; indice >= 0; indice -= 1) {
        if (serie[indice].data <= data) {
            return serie[indice].taxa;
        }
    }
    return null;
}

async function buscarHistorico(moeda, dias) {
    if (moeda.codigo === "USD") {
        return [];
    }

    const url = `https://economia.awesomeapi.com.br/json/daily/${moeda.par}/${dias}`;
    const resposta = await fetch(url);
    if (!resposta.ok) {
        throw new Error(`A API respondeu com HTTP ${resposta.status} para ${moeda.par}.`);
    }

    const cotacoes = await resposta.json();
    if (!Array.isArray(cotacoes)) {
        throw new Error(`A resposta de ${moeda.par} não contém uma lista de cotações.`);
    }

    const porData = new Map();
    for (const cotacao of cotacoes) {
        porData.set(dataDaCotacao(cotacao), taxaMediaParaDolar(cotacao, moeda));
    }
    return Array.from(porData, ([data, taxa]) => ({ data, taxa }))
        .sort((a, b) => a.data.localeCompare(b.data));
}

async function carregarListaMoedas() {
    seletorMoeda.disabled = true;
    seletorDestino.disabled = true;

    try {
        const [respostaPares, respostaNomes] = await Promise.all([
            fetch("https://economia.awesomeapi.com.br/xml/available"),
            fetch("https://economia.awesomeapi.com.br/xml/available/uniq")
        ]);
        if (!respostaPares.ok || !respostaNomes.ok) {
            throw new Error("A API não conseguiu fornecer a lista de moedas.");
        }

        const [textoPares, textoNomes] = await Promise.all([
            respostaPares.text(),
            respostaNomes.text()
        ]);
        const documentoPares = new DOMParser().parseFromString(textoPares, "application/xml");
        const documentoNomes = new DOMParser().parseFromString(textoNomes, "application/xml");
        if (documentoPares.querySelector("parsererror") || documentoNomes.querySelector("parsererror")) {
            throw new Error("A API retornou uma lista de moedas inválida.");
        }

        const paresDisponiveis = new Set(
            Array.from(documentoPares.documentElement.children, (elemento) => elemento.tagName)
        );
        const moedas = new Map([
            ["USD", { codigo: "USD", nome: "Dólar Americano", par: null }]
        ]);

        for (const elemento of documentoNomes.documentElement.children) {
            const codigo = elemento.tagName;
            if (codigo === "USD") {
                continue;
            }

            const parDireto = `${codigo}-USD`;
            const parInvertido = `USD-${codigo}`;
            let par;
            if (paresDisponiveis.has(parDireto)) {
                par = parDireto;
            } else if (paresDisponiveis.has(parInvertido)) {
                par = parInvertido;
            } else {
                continue;
            }

            moedas.set(codigo, {
                codigo,
                nome: elemento.textContent.trim() || codigo,
                par
            });
        }

        const listaMoedas = Array.from(moedas.values()).sort((a, b) => {
            if (a.codigo === "USD") {
                return -1;
            }
            if (b.codigo === "USD") {
                return 1;
            }
            if (a.codigo === "BRL") {
                return -1;
            }
            if (b.codigo === "BRL") {
                return 1;
            }
            return a.nome.localeCompare(b.nome, "pt-BR");
        });
        for (const seletor of [seletorMoeda, seletorDestino]) {
            seletor.replaceChildren(new Option("Selecione uma moeda", ""));
            for (const moeda of listaMoedas) {
                const opcao = new Option(`${moeda.nome} (${moeda.codigo})`, moeda.codigo);
                opcao.dataset.par = moeda.par || "";
                seletor.add(opcao);
            }
        }

        seletorMoeda.value = "USD";
        seletorDestino.value = "BRL";
        seletorMoeda.disabled = false;
        seletorDestino.disabled = false;
        await carregarCotacoes();
    } catch (erro) {
        console.error("Não foi possível carregar a lista de moedas:", erro);
        const indisponivel = new Option("Lista indisponível", "");
        seletorMoeda.replaceChildren(indisponivel);
        seletorDestino.replaceChildren(new Option("Lista indisponível", ""));
        statusGrafico.textContent =
            "Não foi possível carregar a lista de moedas. Verifique a conexão e atualize a página.";
    }
}

async function carregarCotacoes() {
    const codigoOrigem = seletorMoeda.value;
    const codigoDestino = seletorDestino.value;
    if (!codigoOrigem || !codigoDestino) {
        return;
    }

    const idRequisicao = ++requisicaoAtual;
    const dias = Number(seletorPeriodo.value);
    const moedaOrigem = {
        codigo: codigoOrigem,
        par: seletorMoeda.options[seletorMoeda.selectedIndex].dataset.par
    };
    const moedaDestino = {
        codigo: codigoDestino,
        par: seletorDestino.options[seletorDestino.selectedIndex].dataset.par
    };

    if (grafico) {
        grafico.destroy();
        grafico = null;
    }
    cotacaoAtual = null;
    rotuloConversor.textContent = `Quantidade em ${codigoOrigem}`;
    seletorPeriodo.disabled = false;
    statusGrafico.textContent = `Calculando ${codigoOrigem} para ${codigoDestino}...`;
    atualizarConversor();

    try {
        const [serieOrigem, serieDestino] = await Promise.all([
            buscarHistorico(moedaOrigem, dias),
            buscarHistorico(moedaDestino, dias)
        ]);

        if (idRequisicao !== requisicaoAtual) {
            return;
        }
        if ((codigoOrigem !== "USD" && serieOrigem.length === 0) ||
            (codigoDestino !== "USD" && serieDestino.length === 0)) {
            throw new Error("A API não retornou histórico para uma das moedas selecionadas.");
        }

        const serieDatas = codigoOrigem === "USD" ? serieDestino : serieOrigem;
        const datas = codigoOrigem === "USD" && codigoDestino === "USD"
            ? [{ data: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) }]
            : serieDatas;
        const valores = datas.map(({ data }) => {
            const origemParaDolar = codigoOrigem === "USD" ? 1 : taxaNaData(serieOrigem, data);
            const destinoParaDolar = codigoDestino === "USD" ? 1 : taxaNaData(serieDestino, data);
            if (origemParaDolar === null || destinoParaDolar === null ||
                origemParaDolar === undefined || destinoParaDolar === undefined ||
                origemParaDolar <= 0 || destinoParaDolar <= 0) {
                return null;
            }
            return { data, valor: origemParaDolar / destinoParaDolar };
        }).filter(Boolean);

        if (valores.length === 0) {
            throw new Error("Não foi possível alinhar as cotações das moedas selecionadas.");
        }

        cotacaoAtual = valores[valores.length - 1].valor;
        atualizarConversor();
        const nomeOrigem = seletorMoeda.options[seletorMoeda.selectedIndex].text;
        const nomeDestino = seletorDestino.options[seletorDestino.selectedIndex].text;

        grafico = new Chart(canvasGrafico, {
            type: "line",
            data: {
                labels: valores.map(({ data }) => new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR")),
                datasets: [{
                    label: `1 ${codigoOrigem} em ${codigoDestino}`,
                    data: valores.map(({ valor }) => valor),
                    borderColor: "#967c13",
                    backgroundColor: "rgba(150, 124, 19, 0.15)",
                    fill: true,
                    tension: 0.25
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: `Valor de 1 ${codigoOrigem} em ${codigoDestino}`,
                            color: "#4a4949"
                        },
                        ticks: {
                            color: "#4a4949",
                            callback(valor) {
                                return formatarMoeda(valor, codigoDestino);
                            }
                        },
                        grid: { color: "rgba(74, 73, 73, 0.15)" }
                    },
                    x: {
                        title: { display: true, text: "Data", color: "#4a4949" },
                        ticks: { color: "#4a4949" },
                        grid: { color: "rgba(74, 73, 73, 0.08)" }
                    }
                },
                plugins: {
                    legend: { labels: { color: "#4a4949" } },
                    tooltip: {
                        callbacks: {
                            label(contexto) {
                                return `1 ${codigoOrigem} = ${formatarMoeda(contexto.raw, codigoDestino)}`;
                            }
                        }
                    }
                }
            }
        });

        statusGrafico.textContent =
            `Com as cotações mais recentes, 1 ${codigoOrigem} (${nomeOrigem}) vale ` +
            `${formatarMoeda(cotacaoAtual, codigoDestino)} (${nomeDestino}). ` +
            `O gráfico mostra a variação nos últimos ${dias} dias.`;
    } catch (erro) {
        if (idRequisicao !== requisicaoAtual) {
            return;
        }
        console.error("Não foi possível calcular a conversão:", erro);
        statusGrafico.textContent =
            "Não foi possível calcular esse par de moedas. Tente escolher outras moedas ou verifique a conexão.";
        resultadoConversor.textContent = "Não foi possível calcular a conversão.";
    }
}

campoConversor.addEventListener("input", atualizarConversor);
seletorMoeda.addEventListener("change", carregarCotacoes);
seletorDestino.addEventListener("change", carregarCotacoes);
seletorPeriodo.addEventListener("change", carregarCotacoes);
carregarListaMoedas();
