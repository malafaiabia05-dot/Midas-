const API_COTACOES = "https://economia.awesomeapi.com.br";
const seletorMoedaUm = document.getElementById("moeda-um");
const seletorMoedaDois = document.getElementById("moeda-dois");
const formularioComparacao = document.getElementById("form-comparacao");
const botaoComparar = document.getElementById("botao-comparar");
const statusComparacao = document.getElementById("status-comparacao");
const resultadoComparacao = document.getElementById("resultado-comparacao");
const corpoValores = document.getElementById("valores-comparacao");
const canvasComparacao = document.getElementById("grafico-comparacao");
let moedasComparaveis = [];
let requisicaoComparacao = 0;
let graficoComparacao;

function formatarReal(valor) {
    return Number(valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 6
    });
}

function criarLinha(moeda, valor) {
    const linha = document.createElement("tr");
    const celulaMoeda = document.createElement("td");
    const celulaValor = document.createElement("td");
    celulaMoeda.textContent = `${moeda.nome} (${moeda.codigo})`;
    celulaValor.textContent = formatarReal(valor);
    linha.append(celulaMoeda, celulaValor);
    return linha;
}

async function carregarMoedasComparaveis() {
    try {
        const [respostaPares, respostaNomes] = await Promise.all([
            fetch(`${API_COTACOES}/xml/available`),
            fetch(`${API_COTACOES}/xml/available/uniq`)
        ]);
        if (!respostaPares.ok || !respostaNomes.ok) {
            throw new Error("A API não conseguiu carregar as moedas.");
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
            ["USD", { codigo: "USD", nome: "Dólar Americano", par: null }],
            ["BRL", { codigo: "BRL", nome: "Real Brasileiro", par: "BRL-USD" }]
        ]);

        for (const elemento of documentoNomes.documentElement.children) {
            const codigo = elemento.tagName;
            if (codigo === "USD" || codigo === "BRL") {
                continue;
            }

            const parDireto = `${codigo}-USD`;
            const parInvertido = `USD-${codigo}`;
            const par = paresDisponiveis.has(parDireto)
                ? parDireto
                : paresDisponiveis.has(parInvertido)
                    ? parInvertido
                    : null;
            if (par) {
                moedas.set(codigo, {
                    codigo,
                    nome: elemento.textContent.trim() || codigo,
                    par
                });
            }
        }

        moedasComparaveis = Array.from(moedas.values()).sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR")
        );
        for (const seletor of [seletorMoedaUm, seletorMoedaDois]) {
            seletor.replaceChildren(new Option("Escolha uma moeda", ""));
            for (const moeda of moedasComparaveis) {
                seletor.add(new Option(`${moeda.nome} (${moeda.codigo})`, moeda.codigo));
            }
            seletor.disabled = false;
        }
        seletorMoedaUm.value = "USD";
        seletorMoedaDois.value = "BRL";
        botaoComparar.disabled = false;
        statusComparacao.textContent = "Moedas carregadas. Escolha duas e clique em Comparar moedas.";
    } catch (erro) {
        console.error("Erro ao carregar moedas para comparação:", erro);
        statusComparacao.textContent =
            "Não foi possível carregar as moedas. Verifique a conexão e atualize a página.";
    }
}

async function buscarValorEmReais(moeda) {
    if (moeda.codigo === "BRL") {
        return 1;
    }

    const pares = moeda.codigo === "USD"
        ? ["USD-BRL"]
        : [moeda.par, "USD-BRL"];
    const resposta = await fetch(`${API_COTACOES}/json/last/${pares.join(",")}`);
    if (!resposta.ok) {
        throw new Error(`A API respondeu com HTTP ${resposta.status}.`);
    }

    const cotacoes = await resposta.json();
    const cotacaoDolarReal = cotacoes.USDBRL;
    if (!cotacaoDolarReal) {
        throw new Error("Cotação USD/BRL não encontrada.");
    }
    const dolarEmReais = (Number(cotacaoDolarReal.bid) + Number(cotacaoDolarReal.ask)) / 2;
    if (moeda.codigo === "USD") {
        return dolarEmReais;
    }

    const cotacaoMoeda = cotacoes[moeda.par.replace("-", "")];
    if (!cotacaoMoeda) {
        throw new Error(`Cotação de ${moeda.codigo} não encontrada.`);
    }
    const media = (Number(cotacaoMoeda.bid) + Number(cotacaoMoeda.ask)) / 2;
    const codigoBase = cotacaoMoeda.code || moeda.par.split("-")[0];
    const valorEmDolares = codigoBase === moeda.codigo ? media : 1 / media;
    const valorEmReais = valorEmDolares * dolarEmReais;
    if (!Number.isFinite(valorEmReais) || valorEmReais <= 0) {
        throw new Error(`A cotação de ${moeda.codigo} é inválida.`);
    }
    return valorEmReais;
}

function mostrarComparacao(moedaUm, valorUm, moedaDois, valorDois) {
    resultadoComparacao.hidden = false;
    if (graficoComparacao) {
        graficoComparacao.destroy();
    }
    graficoComparacao = new Chart(canvasComparacao, {
        type: "bar",
        data: {
            labels: [`${moedaUm.nome} (${moedaUm.codigo})`, `${moedaDois.nome} (${moedaDois.codigo})`],
            datasets: [{
                label: "Valor de 1 unidade em reais",
                data: [valorUm, valorDois],
                backgroundColor: ["rgba(150, 124, 19, 0.8)", "rgba(85, 70, 6, 0.8)"],
                borderColor: ["#967c13", "#554606"],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            scales: {
                x: {
                    beginAtZero: true,
                    title: { display: true, text: "Valor de 1 unidade em reais (BRL)", color: "#4a4949" },
                    ticks: {
                        color: "#4a4949",
                        callback(valor) {
                            return formatarReal(valor);
                        }
                    },
                    grid: { color: "rgba(74, 73, 73, 0.15)" }
                },
                y: {
                    ticks: { color: "#4a4949" },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(contexto) {
                            return formatarReal(contexto.raw);
                        }
                    }
                }
            }
        }
    });

    corpoValores.replaceChildren(
        criarLinha(moedaUm, valorUm),
        criarLinha(moedaDois, valorDois)
    );

    const nomeUm = `${moedaUm.nome} (${moedaUm.codigo})`;
    const nomeDois = `${moedaDois.nome} (${moedaDois.codigo})`;
    const moedaMaisValiosa = valorUm >= valorDois ? nomeUm : nomeDois;
    const moedaMenosValiosa = valorUm < valorDois ? nomeUm : nomeDois;
    document.getElementById("resumo-comparacao").textContent =
        `Nesta cotação, 1 ${moedaMaisValiosa} vale mais em reais que 1 ${moedaMenosValiosa}. Isso compara apenas o valor nominal de uma unidade, não o valor econômico total das moedas.`;
    document.getElementById("titulo-moeda-um").textContent = nomeUm;
    document.getElementById("titulo-moeda-dois").textContent = nomeDois;

    const primeiraValeMais = valorUm >= valorDois;
    document.getElementById("pro-moeda-um").textContent = primeiraValeMais
        ? `Ponto favorável nesta comparação: uma unidade vale ${formatarReal(valorUm)}, mais em reais que a outra unidade.`
        : `Ponto favorável nesta comparação: uma unidade custa menos em reais (${formatarReal(valorUm)}), facilitando comparar pequenas quantias nominais.`;
    document.getElementById("contra-moeda-um").textContent = primeiraValeMais
        ? `Limitação: cada unidade custa mais em reais (${formatarReal(valorUm)}); isso não significa maior poder de compra ou mais estabilidade.`
        : "Limitação: são necessárias mais unidades para alcançar o mesmo valor nominal em reais; isso não significa uma moeda pior.";
    document.getElementById("pro-moeda-dois").textContent = !primeiraValeMais
        ? `Ponto favorável nesta comparação: uma unidade vale ${formatarReal(valorDois)}, mais em reais que a outra unidade.`
        : `Ponto favorável nesta comparação: uma unidade custa menos em reais (${formatarReal(valorDois)}), facilitando comparar pequenas quantias nominais.`;
    document.getElementById("contra-moeda-dois").textContent = !primeiraValeMais
        ? `Limitação: cada unidade custa mais em reais (${formatarReal(valorDois)}); isso não significa maior poder de compra ou mais estabilidade.`
        : "Limitação: são necessárias mais unidades para alcançar o mesmo valor nominal em reais; isso não significa uma moeda pior.";
}

async function atualizarComparacao() {
    const moedaUm = moedasComparaveis.find((moeda) => moeda.codigo === seletorMoedaUm.value);
    const moedaDois = moedasComparaveis.find((moeda) => moeda.codigo === seletorMoedaDois.value);
    if (!moedaUm || !moedaDois) {
        resultadoComparacao.hidden = true;
        statusComparacao.textContent = "Escolha as duas moedas para ver o gráfico e a comparação.";
        return;
    }
    if (moedaUm.codigo === moedaDois.codigo) {
        resultadoComparacao.hidden = true;
        statusComparacao.textContent = "Escolha duas moedas diferentes para comparar.";
        return;
    }

    const idRequisicao = ++requisicaoComparacao;
    botaoComparar.disabled = true;
    resultadoComparacao.hidden = true;
    statusComparacao.textContent = "Buscando cotações atuais...";
    try {
        const [valorUm, valorDois] = await Promise.all([
            buscarValorEmReais(moedaUm),
            buscarValorEmReais(moedaDois)
        ]);
        if (idRequisicao !== requisicaoComparacao) {
            return;
        }
        mostrarComparacao(moedaUm, valorUm, moedaDois, valorDois);
        statusComparacao.textContent = "Comparação atualizada com as cotações disponíveis.";
    } catch (erro) {
        console.error("Erro ao comparar moedas:", erro);
        statusComparacao.textContent =
            "Não foi possível comparar essas moedas agora. Verifique a conexão e tente novamente.";
    } finally {
        if (idRequisicao === requisicaoComparacao) {
            botaoComparar.disabled = false;
        }
    }
}

formularioComparacao.addEventListener("submit", (evento) => {
    evento.preventDefault();
    atualizarComparacao();
});

for (const seletor of [seletorMoedaUm, seletorMoedaDois]) {
    seletor.addEventListener("change", atualizarComparacao);
}

carregarMoedasComparaveis();
