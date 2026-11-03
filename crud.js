const BACK4APP_APP_ID = "mBICHjZBYTXHVoQGrHKcMkNHwPOipoZwvOdF6W0B";
const BACK4APP_JAVASCRIPT_KEY = "Rlb9zvIY5QzQJZssZZgKWd8WoedUn3VDdXve5O23";
const NOME_CLASSE = "MetaCotacao";

const formularioAutenticacao = document.getElementById("auth-form");
const campoUsuario = document.getElementById("auth-usuario");
const campoEmail = document.getElementById("auth-email");
const campoSenha = document.getElementById("auth-senha");
const botaoEntrar = document.getElementById("entrar-conta");
const botaoCriarConta = document.getElementById("criar-conta");
const botaoEsqueciSenha = document.getElementById("esqueci-senha");
const botaoMostrarSenha = document.getElementById("mostrar-senha");
const botaoSair = document.getElementById("sair-conta");
const statusAutenticacao = document.getElementById("auth-status");
const formularioMeta = document.getElementById("meta-form");
const campoIdMeta = document.getElementById("meta-object-id");
const campoValorMeta = document.getElementById("meta-valor");
const campoAnotacaoMeta = document.getElementById("meta-anotacao");
const botaoCancelarEdicao = document.getElementById("meta-cancelar");
const statusMetas = document.getElementById("meta-status");
const listaMetas = document.getElementById("metas-lista");

function mostrarStatusMeta(mensagem) {
    statusMetas.textContent = mensagem;
}

botaoMostrarSenha.addEventListener("click", () => {
    const mostrar = campoSenha.type === "password";
    campoSenha.type = mostrar ? "text" : "password";
    botaoMostrarSenha.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
    botaoMostrarSenha.title = mostrar ? "Ocultar senha" : "Mostrar senha";
});

function formatarValorMeta(valor) {
    return Number(valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function criarCelula(texto) {
    const celula = document.createElement("td");
    celula.textContent = texto;
    return celula;
}

function limparFormularioMeta() {
    formularioMeta.reset();
    campoIdMeta.value = "";
    botaoCancelarEdicao.hidden = true;
    formularioMeta.querySelector("#meta-salvar").textContent = "Salvar meta";
}

async function listarMetas() {
    mostrarStatusMeta("Carregando metas compartilhadas...");
    listaMetas.replaceChildren();

    try {
        const ClasseMeta = Parse.Object.extend(NOME_CLASSE);
        const consulta = new Parse.Query(ClasseMeta);
        consulta.descending("createdAt");
        const metas = await consulta.find();

        if (metas.length === 0) {
            mostrarStatusMeta("Nenhuma meta cadastrada ainda.");
            return true;
        }

        for (const meta of metas) {
            const linha = document.createElement("tr");
            linha.append(
                criarCelula(formatarValorMeta(meta.get("valorAlvo"))),
                criarCelula(meta.get("anotação") || "")
            );

            const celulaAcoes = document.createElement("td");
            const grupoAcoes = document.createElement("div");
            grupoAcoes.className = "d-flex flex-wrap gap-2";
            const usuarioAtual = Parse.User.current();
            const acl = meta.getACL();
            const podeGerenciar = Boolean(
                usuarioAtual && acl && acl.getWriteAccess(usuarioAtual.id)
            );

            if (podeGerenciar) {
                const botaoEditar = document.createElement("button");
                botaoEditar.className = "btn btn-sm btn-outline-primary";
                botaoEditar.type = "button";
                botaoEditar.textContent = "Editar";
                botaoEditar.addEventListener("click", () => {
                    campoIdMeta.value = meta.id;
                    campoValorMeta.value = meta.get("valorAlvo");
                    campoAnotacaoMeta.value = meta.get("anotação") || "";
                    formularioMeta.querySelector("#meta-salvar").textContent = "Atualizar meta";
                    botaoCancelarEdicao.hidden = false;
                    formularioMeta.hidden = false;
                    campoValorMeta.focus();
                });

                const botaoExcluir = document.createElement("button");
                botaoExcluir.className = "btn btn-sm btn-outline-danger";
                botaoExcluir.type = "button";
                botaoExcluir.textContent = "Excluir";
                botaoExcluir.addEventListener("click", async () => {
                    botaoExcluir.disabled = true;
                    try {
                        await meta.destroy();
                        if (campoIdMeta.value === meta.id) {
                            limparFormularioMeta();
                        }
                        mostrarStatusMeta("Meta excluída.");
                        await listarMetas();
                    } catch (erro) {
                        console.error("Erro ao excluir meta:", erro);
                        mostrarStatusMeta("Não foi possível excluir esta meta.");
                        botaoExcluir.disabled = false;
                    }
                });

                grupoAcoes.append(botaoEditar, botaoExcluir);
            } else {
                grupoAcoes.textContent = "Somente quem cadastrou pode editar";
            }
            celulaAcoes.append(grupoAcoes);
            linha.append(celulaAcoes);
            listaMetas.append(linha);
        }

        mostrarStatusMeta(`${metas.length} meta(s) compartilhada(s).`);
        return true;
    } catch (erro) {
        console.error("Erro ao listar metas:", erro);
        mostrarStatusMeta("Não foi possível carregar as metas. Ative a leitura pública da classe MetaCotacao no Back4App.");
        return false;
    }
}

formularioMeta.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    if (!Parse.User.current()) {
        mostrarStatusMeta("Erro: entre na sua conta antes de salvar uma meta.");
        return;
    }

    const valorAlvo = Number(campoValorMeta.value);
    const anotacao = campoAnotacaoMeta.value.trim();
    if (!Number.isFinite(valorAlvo) || valorAlvo <= 0 || !anotacao) {
        mostrarStatusMeta("Erro: informe um valor-alvo positivo e uma anotação.");
        return;
    }

    const estavaEditando = Boolean(campoIdMeta.value);
    const botaoSalvar = formularioMeta.querySelector("#meta-salvar");
    botaoSalvar.disabled = true;
    mostrarStatusMeta("Salvando meta...");

    try {
        const ClasseMeta = Parse.Object.extend(NOME_CLASSE);
        let meta;

        if (campoIdMeta.value) {
            meta = await new Parse.Query(ClasseMeta).get(campoIdMeta.value);
        } else {
            meta = new ClasseMeta();
            const acl = new Parse.ACL(Parse.User.current());
            acl.setPublicReadAccess(true);
            meta.setACL(acl);
        }

        meta.set("valorAlvo", valorAlvo);
        meta.set("anotação", anotacao);
        await meta.save();

        limparFormularioMeta();
        const listaAtualizada = await listarMetas();
        mostrarStatusMeta(listaAtualizada
            ? (estavaEditando ? "Meta atualizada com sucesso!" : "Meta salva com sucesso!")
            : (estavaEditando
                ? "Meta atualizada com sucesso, mas não foi possível atualizar a lista."
                : "Meta salva com sucesso, mas não foi possível atualizar a lista."));
    } catch (erro) {
        console.error("Erro ao salvar meta:", erro);
        const codigoErro = Number(erro?.code);
        const mensagemErro = typeof erro?.message === "string" ? erro.message : "";
        if (codigoErro === 119 && estavaEditando) {
            mostrarStatusMeta(`Erro do Back4App: a edição foi bloqueada. Habilite Update para usuários autenticados em MetaCotacao > Security & Permissions. ${mensagemErro}`);
        } else if (codigoErro === 119) {
            mostrarStatusMeta(`Erro do Back4App: o cadastro foi bloqueado. Habilite Create para usuários autenticados em MetaCotacao > Security & Permissions. ${mensagemErro}`);
        } else if (codigoErro === 111) {
            mostrarStatusMeta(`Erro nos campos da classe MetaCotacao. Confira se valorAlvo é Number e anotação é String. ${mensagemErro}`);
        } else if (Number(erro?.code) === 209) {
            mostrarStatusMeta("Erro: sua sessão expirou. Entre novamente e tente salvar a meta.");
        } else {
            const codigo = erro?.code ? ` (código ${erro.code})` : "";
            const detalhe = mensagemErro ? ` Detalhe: ${mensagemErro}` : "";
            mostrarStatusMeta(`Erro ao salvar a meta${codigo}.${detalhe}`);
        }
    } finally {
        botaoSalvar.disabled = false;
    }
});

botaoCancelarEdicao.addEventListener("click", limparFormularioMeta);

function mostrarMetas(usuario) {
    formularioAutenticacao.hidden = Boolean(usuario);
    botaoSair.hidden = !usuario;
    formularioMeta.hidden = !usuario;
    const textoApresentacao = document.getElementById("metas-intro");
    if (textoApresentacao) {
        textoApresentacao.textContent = usuario
            ? "Suas metas podem ser vistas por todos. Você pode cadastrar, editar ou excluir somente as que criou."
            : "As metas são públicas para consulta. Entre ou crie uma conta para cadastrar e gerenciar as suas.";
    }

    listarMetas();
}

if (BACK4APP_APP_ID === "COLE_SEU_APP_ID_AQUI" ||
    BACK4APP_JAVASCRIPT_KEY === "COLE_SUA_JAVASCRIPT_KEY_AQUI") {
    console.error("Back4App não configurado: informe o App ID e a JavaScript Key em crud.js.");
    statusAutenticacao.textContent = "Cadastro e login estão temporariamente indisponíveis.";
    botaoEntrar.disabled = true;
    botaoCriarConta.disabled = true;
    botaoEsqueciSenha.disabled = true;
    formularioMeta.hidden = true;
    mostrarStatusMeta("O login precisa ser configurado para cadastrar metas. A leitura pública também precisa ser ativada no Back4App.");
} else {
    Parse.initialize(BACK4APP_APP_ID, BACK4APP_JAVASCRIPT_KEY);
    Parse.serverURL = "https://parseapi.back4app.com/";

    formularioAutenticacao.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        botaoEntrar.disabled = true;
        statusAutenticacao.textContent = "Entrando...";

        try {
            const usuario = await Parse.User.logIn(campoUsuario.value.trim(), campoSenha.value);
            formularioAutenticacao.reset();
            statusAutenticacao.textContent = `Olá, ${usuario.getUsername()}!`;
            mostrarMetas(usuario);
        } catch (erro) {
            console.error("Erro ao entrar:", erro);
            statusAutenticacao.textContent = "Não foi possível entrar. Confira o usuário, a senha e a conexão.";
        } finally {
            botaoEntrar.disabled = false;
        }
    });

    botaoCriarConta.addEventListener("click", async () => {
        const username = campoUsuario.value.trim();
        const email = campoEmail.value.trim();
        const password = campoSenha.value;
        if (!username || !email || !campoEmail.checkValidity() || !password) {
            statusAutenticacao.textContent = "Para criar uma conta, preencha um usuário, um e-mail válido e uma senha.";
            return;
        }

        botaoCriarConta.disabled = true;
        statusAutenticacao.textContent = "Criando conta...";
        try {
            const usuario = new Parse.User();
            usuario.setUsername(username);
            usuario.setEmail(email);
            usuario.setPassword(password);
            await usuario.signUp();
            formularioAutenticacao.reset();
            statusAutenticacao.textContent =
                `Conta criada. Olá, ${usuario.getUsername()}! Confira seu e-mail para validar a conta, se solicitado.`;
            mostrarMetas(usuario);
        } catch (erro) {
            console.error("Erro ao criar conta:", erro);
            statusAutenticacao.textContent = "Não foi possível criar a conta. O nome de usuário pode já estar em uso.";
        } finally {
            botaoCriarConta.disabled = false;
        }
    });

    botaoEsqueciSenha.addEventListener("click", async () => {
        const email = campoEmail.value.trim();
        if (!email || !campoEmail.checkValidity()) {
            statusAutenticacao.textContent = "Digite um e-mail válido para receber o link de redefinição.";
            campoEmail.focus();
            return;
        }

        botaoEsqueciSenha.disabled = true;
        statusAutenticacao.textContent = "Solicitando link de redefinição...";
        try {
            await Parse.User.requestPasswordReset(email);
            statusAutenticacao.textContent =
                "Se esse e-mail estiver cadastrado, o Back4App enviará um link para criar uma nova senha. Confira também o spam.";
        } catch (erro) {
            console.error("Erro ao solicitar redefinição de senha:", erro);
            statusAutenticacao.textContent =
                "Não foi possível solicitar a redefinição. Confira o e-mail e as configurações de e-mail do Back4App.";
        } finally {
            botaoEsqueciSenha.disabled = false;
        }
    });

    botaoSair.addEventListener("click", async () => {
        botaoSair.disabled = true;
        try {
            await Parse.User.logOut();
            mostrarMetas(null);
            statusAutenticacao.textContent = "Você saiu da conta.";
        } catch (erro) {
            console.error("Erro ao sair:", erro);
            statusAutenticacao.textContent = "Não foi possível sair da conta.";
        } finally {
            botaoSair.disabled = false;
        }
    });

    const usuarioAtual = Parse.User.current();
    if (usuarioAtual) {
        statusAutenticacao.textContent = `Olá, ${usuarioAtual.getUsername()}!`;
        mostrarMetas(usuarioAtual);
    } else {
        statusAutenticacao.textContent = "Entre ou crie uma conta para gerenciar suas metas.";
        mostrarMetas(null);
    }
}