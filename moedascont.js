const BASE_API = "https://economia.awesomeapi.com.br";
const canvasContinente = document.getElementById("grafico-continente");
const statusContinente = document.getElementById("status-continente");
const tabelaContinente = document.getElementById("tabela-continente");
const dadosContinente = document.getElementById("continente-dados");
const botoesContinente = Array.from(document.querySelectorAll(".continente-botao"));
const MOEDAS_POR_CONTINENTE = {
    americas: ["USD", "CAD", "MXN", "BRL", "ARS", "CLP", "COP", "PEN", "UYU", "PYG", "BOB", "VES", "DOP", "CRC", "GTQ", "HNL", "NIO", "PAB", "JMD", "TTD", "BBD", "BSD", "BZD", "XCD", "CUP", "HTG", "AWG", "ANG", "KYD", "SRD", "GYD"],
    europa: ["EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "ISK", "RUB", "UAH", "TRY", "ALL", "MKD", "RSD", "BAM", "MDL"],
    asia: ["CNY", "JPY", "KRW", "INR", "IDR", "THB", "MYR", "SGD", "HKD", "TWD", "PHP", "VND", "PKR", "BDT", "LKR", "NPR", "KZT", "UZS", "KGS", "TJS", "MNT", "MMK", "LAK", "KHR", "BND", "MOP", "AED", "SAR", "QAR", "KWD", "BHD", "OMR", "JOD", "ILS", "IRR", "IQD", "AFN", "YER", "SYP", "LBP", "AZN", "GEL", "AMD"],
    africa: ["ZAR", "EGP", "NGN", "GHS", "KES", "TZS", "UGX", "RWF", "BIF", "XOF", "XAF", "MUR", "SCR", "MAD", "DZD", "TND", "LYD", "SDG", "SSP", "ETB", "GMD", "SLL", "LRD", "CDF", "AOA", "MZN", "ZMW", "MWK", "BWP", "NAD", "SZL", "LSL", "MGA", "DJF", "KMF", "ERN", "SOS", "MRU", "CVE", "STN"],
    oceania: ["AUD", "NZD", "FJD", "PGK", "SBD", "VUV", "WST", "TOP", "XPF", "TVD", "KID"]
};
const NOMES_CONTINENTES = {
    americas: "Américas",
    europa: "Europa",
    asia: "Ásia",
    africa: "África",
    oceania: "Oceania"
};
let graficoContinente;
let moedasDisponiveis = [];
let requisicaoContinente = 0;

function formatarReal(valor) {
    return Number(valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 6
    });
}

function taxaMediaParaDolar(cotacao, moeda) {
    const media = (Number(cotacao.bid) + Number(cotacao.ask)) / 2;
    const codigoBase = cotacao.code || moeda.par.split("-")[0];
    return codigoBase === moeda.codigo ? media : 1 / media;
}

async function carregarListaMoedas() {
    try {
        const [respostaPares, respostaNomes] = await Promise.all([
            fetch(`${BASE_API}/xml/available`),
            fetch(`${BASE_API}/xml/available/uniq`)
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
            const par = paresDisponiveis.has(parDireto)
                ? parDireto
                : paresDisponiveis.has(parInvertido)
                    ? parInvertido
                    : null;
            if (!par) {
                continue;
            }

            moedas.set(codigo, {
                codigo,
                nome: elemento.textContent.trim() || codigo,
                par
            });
        }

        moedasDisponiveis = Array.from(moedas.values());
        statusContinente.textContent = "Moedas carregadas. Clique em um continente para ver as cotações.";
    } catch (erro) {
        console.error("Não foi possível carregar a lista de moedas:", erro);
        statusContinente.textContent =
            "Não foi possível carregar a lista de moedas. Verifique a conexão e atualize a página.";
    }
}

async function buscarCotacoesAtuais(moedas) {
    const cotacoesPorCodigo = new Map();
    const pares = Array.from(new Set(moedas.map((moeda) => moeda.par).filter(Boolean)));
    if (!pares.includes("USD-BRL")) {
        pares.unshift("USD-BRL");
    }

    for (let inicio = 0; inicio < pares.length; inicio += 20) {
        const lote = pares.slice(inicio, inicio + 20);
        const resposta = await fetch(`${BASE_API}/json/last/${lote.join(",")}`);
        if (!resposta.ok) {
            throw new Error(`A API respondeu com HTTP ${resposta.status} ao buscar as cotações.`);
        }
        const cotacoes = await resposta.json();
        for (const [par, cotacao] of Object.entries(cotacoes)) {
            cotacoesPorCodigo.set(par, cotacao);
        }
    }

    return cotacoesPorCodigo;
}

async function carregarGraficoContinente(codigoContinente) {
    const idRequisicao = ++requisicaoContinente;
    const botaoSelecionado = botoesContinente.find((botao) =>
        botao.dataset.continente === codigoContinente
    );
    if (botaoSelecionado.getAttribute("aria-pressed") === "true") {
        for (const botao of botoesContinente) {
            botao.setAttribute("aria-pressed", "false");
        }
        dadosContinente.hidden = true;
        tabelaContinente.replaceChildren();
        if (graficoContinente) {
            graficoContinente.destroy();
            graficoContinente = null;
        }
        return;
    }

    const moedas = MOEDAS_POR_CONTINENTE[codigoContinente]
        .map((codigo) => moedasDisponiveis.find((moeda) => moeda.codigo === codigo))
        .filter(Boolean);
    for (const botao of botoesContinente) {
        botao.setAttribute("aria-pressed", String(botao === botaoSelecionado));
    }
    dadosContinente.hidden = false;
    tabelaContinente.replaceChildren();

    if (moedas.length === 0) {
        statusContinente.textContent = `A API não oferece moedas disponíveis para ${NOMES_CONTINENTES[codigoContinente]}.`;
        if (graficoContinente) {
            graficoContinente.destroy();
            graficoContinente = null;
        }
        return;
    }

    statusContinente.textContent = `Buscando cotações atuais para ${NOMES_CONTINENTES[codigoContinente]}...`;
    try {
        const cotacoes = await buscarCotacoesAtuais(moedas);
        if (idRequisicao !== requisicaoContinente) {
            return;
        }

        const cotacaoDolarReal = cotacoes.get("USDBRL");
        if (!cotacaoDolarReal) {
            throw new Error("A API não retornou a cotação de USD para BRL.");
        }
        const dolarEmReais = (Number(cotacaoDolarReal.bid) + Number(cotacaoDolarReal.ask)) / 2;
        const valores = moedas.flatMap((moeda) => {
            if (moeda.codigo === "BRL") {
                return [{ ...moeda, valorBRL: 1 }];
            }
            if (moeda.codigo === "USD") {
                return [{ ...moeda, valorBRL: dolarEmReais }];
            }

            const cotacao = cotacoes.get(moeda.par.replace("-", ""));
            if (!cotacao) {
                return [];
            }
            const valorBRL = taxaMediaParaDolar(cotacao, moeda) * dolarEmReais;
            return Number.isFinite(valorBRL) && valorBRL > 0
                ? [{ ...moeda, valorBRL }]
                : [];
        }).sort((a, b) => b.valorBRL - a.valorBRL);

        if (valores.length === 0) {
            throw new Error("A API não retornou cotações válidas para esse continente.");
        }

        const somaValores = valores.reduce((total, moeda) => total + moeda.valorBRL, 0);
        for (const moeda of valores) {
            moeda.porcentagem = moeda.valorBRL / somaValores * 100;
        }

        if (graficoContinente) {
            graficoContinente.destroy();
        }
        graficoContinente = new Chart(canvasContinente, {
            type: "pie",
            data: {
                labels: valores.map(({ nome, codigo }) => `${nome} (${codigo})`),
                datasets: [{
                    data: valores.map(({ valorBRL }) => valorBRL),
                    backgroundColor: valores.map((_, indice) =>
                        `hsl(${Math.round(indice * 360 / valores.length)} 68% 52%)`
                    ),
                    borderColor: "#ffffff",
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label(contexto) {
                                const moeda = valores[contexto.dataIndex];
                                return `${contexto.label}: ${formatarReal(contexto.raw)} por unidade (${moeda.porcentagem.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%)`;
                            }
                        }
                    }
                }
            }
        });

        for (const moeda of valores) {
            const linha = document.createElement("tr");
            const celulaMoeda = document.createElement("td");
            const celulaValor = document.createElement("td");
            const celulaPorcentagem = document.createElement("td");
            celulaMoeda.textContent = `${moeda.nome} (${moeda.codigo})`;
            celulaValor.textContent = formatarReal(moeda.valorBRL);
            celulaPorcentagem.textContent =
                `${moeda.porcentagem.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
            linha.append(celulaMoeda, celulaValor, celulaPorcentagem);
            tabelaContinente.append(linha);
        }
        statusContinente.textContent =
            `${valores.length} moeda(s) disponíveis em ${NOMES_CONTINENTES[codigoContinente]}, ordenadas do maior para o menor valor por unidade.`;
    } catch (erro) {
        if (idRequisicao !== requisicaoContinente) {
            return;
        }
        console.error("Não foi possível carregar as cotações do continente:", erro);
        statusContinente.textContent =
            "Não foi possível carregar as cotações. Confira a conexão e tente escolher o continente novamente.";
    }
}

botoesContinente.forEach((botao) => {
    botao.addEventListener("click", () => carregarGraficoContinente(botao.dataset.continente));
});

carregarListaMoedas();
