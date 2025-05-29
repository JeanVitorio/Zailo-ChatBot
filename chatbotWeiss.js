const express = require('express');
const qrcode = require('qrcode');
const { Client, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const client = new Client();
let qrCodeUrl = '';

const delay = ms => new Promise(res => setTimeout(res, ms));

const carros = JSON.parse(fs.readFileSync('carros.json', 'utf-8'));

const estadoCliente = new Map();
const interessesClientes = new Map();
const ultimoBoasVindas = new Map();

function podeEnviarBoasVindas(chatId) {
    const ultimoEnvio = ultimoBoasVindas.get(chatId);
    if (!ultimoEnvio) return true;
    return (Date.now() - ultimoEnvio) > 24 * 60 * 60 * 1000;
}

function registrarBoasVindas(chatId) {
    ultimoBoasVindas.set(chatId, Date.now());
}

// Funções de validação
function isValidAmount(amount) {
    return /^\d+(\.\d{1,2})?$/.test(amount) || /^\d+$/.test(amount);
}

function isValidParcels(parcels) {
    return /^\d+$/.test(parcels) && parseInt(parcels) > 0;
}

function isValidCPF(cpf) {
    return /^\d{11}$/.test(cpf);
}

function isValidDate(date) {
    return /^\d{2}\/\d{2}\/\d{4}$/.test(date);
}

function isValidVisitDate(date) {
    // Aceita dd/mm/aaaa ou texto simples (ex.: "amanhã", "sexta")
    return /^\d{2}\/\d{2}\/\d{4}$/.test(date) || /^[a-zA-Z\s]+$/.test(date);
}

function isValidVisitTime(time) {
    // Aceita HH:MM (ex.: 14:30)
    return /^\d{2}:\d{2}$/.test(time);
}

function isValidFullName(name) {
    // Pelo menos dois palavras com letras
    return name.trim().split(/\s+/).length >= 2 && /^[a-zA-Z\s]+$/.test(name);
}

async function enviarImagensDoCarro(chatId, carro) {
    for (const imagemPath of carro.imagens) {
        try {
            const fullPath = path.join(__dirname, imagemPath);
            const media = MessageMedia.fromFilePath(fullPath);
            await client.sendMessage(chatId, media);
            await delay(500);
        } catch (err) {
            console.error(`Erro ao enviar imagem: ${imagemPath}`, err);
        }
    }
}

async function enviarRelatorioParaContatos(chatId) {
    const dados = interessesClientes.get(chatId);
    if (!dados) return;

    let mensagem = `📊 *Novo Relatório de Cliente:*\n📱 Cliente: ${chatId}\n`;

    if (dados.interesses?.length) {
        mensagem += `\n🚗 *Carros visualizados:*\n`;
        dados.interesses.forEach((nome, i) => {
            mensagem += `  ${i + 1}. ${nome}\n`;
        });
    }

    if (dados.financiamento) {
        mensagem += `\n💰 *Solicitou simulação de financiamento:*\n`;
        mensagem += `Carro escolhido: ${dados.financiamento.carroEscolhido || 'Não informado'}\n`;
        mensagem += `Entrada: R$ ${dados.financiamento.entrada || 'Não informado'}\n`;
        mensagem += `Parcelas: ${dados.financiamento.parcelas || 'Não informado'}\n`;
        mensagem += `CPF: ${dados.financiamento.cpf || 'Não informado'}\n`;
        mensagem += `Nascimento: ${dados.financiamento.nascimento || 'Não informado'}\n`;
    }

    if (dados.visita) {
        mensagem += `\n📅 *Solicitou agendamento de visita:*\n`;
        mensagem += `Dia: ${dados.visita.dia || 'Não informado'}\n`;
        mensagem += `Horário: ${dados.visita.horario || 'Não informado'}\n`;
        mensagem += `Nome completo: ${dados.visita.nome || 'Não informado'}\n`;
    }

    mensagem += `\n*⚠️ Atenção:* Este relatório contém informações sensíveis. Garanta conformidade com a LGPD e não compartilhe sem autorização.`;

    for (const contato of carros.numeros_para_contato) {
        let numeroWhatsApp = contato.numero;
        if (!numeroWhatsApp.includes('@c.us')) {
            numeroWhatsApp = numeroWhatsApp.replace(/\D/g, '') + '@c.us';
        }
        try {
            await client.sendMessage(numeroWhatsApp, mensagem);
            console.log(`✅ Relatório enviado para ${contato.nome}`);
        } catch (err) {
            console.error(`Erro ao enviar relatório para ${contato.nome}:`, err);
        }
    }
}

client.on('qr', async qr => {
    qrCodeUrl = await qrcode.toDataURL(qr);
    console.log('QRCode gerado! Acesse no navegador para escanear.');
});

client.on('ready', () => {
    console.log('✅ Bot da Weiss Multimarcas está online!');
});

client.initialize();

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function enviarMenuInicial(chatId) {
    const mensagem = `🤩 Weiss Multimarcas - Menu Principal\n\nEscolha uma opção digitando o número:\n1 - Ver modelos disponíveis\n2 - Quero um carro financiado\n3 - Quero agendar uma visita\n4 - Falar com um vendedor humano\n5 - Quero trocar meu carro\n6 - Quero vender meu carro`;
    await client.sendMessage(chatId, mensagem);
}

async function enviarListaCarros(chatId) {
    let lista = `Temos alguns modelos incríveis disponíveis no momento:\n\n`;
    for (const carro of carros.modelos) {
        lista += `🚘 *${carro.nome}* - ${carro.preco}\n`;
    }
    lista += `\nDigite o nome do carro que te interessou ou escolha outra opção do menu (1-6).`;
    await client.sendMessage(chatId, lista);
}

client.on('message', async msg => {
    const chatId = msg.from;
    const textoOriginal = msg.body.trim();
    const texto = textoOriginal.toUpperCase();

    const estado = estadoCliente.get(chatId);

    // Iniciar atendimento com qualquer mensagem
    if (!estado && chatId.endsWith('@c.us')) {
        await wait(1000);
        if (podeEnviarBoasVindas(chatId)) {
            await client.sendMessage(
                chatId,
                `Olá! 👋 Seja muito bem-vindo à 🤩Weiss Multimarcas 🤩!\nMe chamo Zailon, sou seu consultor virtual. 🚗✨`
            );
            registrarBoasVindas(chatId);
        }
        estadoCliente.set(chatId, { etapa: 'menuInicial' });
        await enviarMenuInicial(chatId);
        return;
    }

    // Fluxo de agendamento de visita
    if (estado?.etapa === 'aguardandoDiaVisita') {
        if (isValidVisitDate(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.visita) dados.visita = {};
            dados.visita.dia = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoHorarioVisita' });
            await client.sendMessage(chatId, `Dia registrado: ${textoOriginal}. Agora, informe o *horário* desejado (ex.: 14:30):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um dia válido (ex.: 30/05/2025 ou "amanhã").`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoHorarioVisita') {
        if (isValidVisitTime(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.visita) dados.visita = {};
            dados.visita.horario = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoNomeVisita' });
            await client.sendMessage(chatId, `Horário registrado: ${textoOriginal}. Agora, informe seu *nome completo*:`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um horário válido (ex.: 14:30).`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoNomeVisita') {
        if (isValidFullName(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.visita) dados.visita = {};
            dados.visita.nome = textoOriginal;
            interessesClientes.set(chatId, dados);

            await client.sendMessage(chatId, `✅ Agendamento solicitado! Um consultor entrará em contato para confirmar a disponibilidade. 😊`);
            await enviarRelatorioParaContatos(chatId);
            await client.sendMessage(chatId, `📨 Relatório enviado! Obrigado pelo seu tempo. 👋 Se precisar de mais alguma coisa, é só chamar!`);

            estadoCliente.delete(chatId);
            interessesClientes.delete(chatId);
            await wait(1000);
            estadoCliente.set(chatId, { etapa: 'menuInicial' });
            await enviarMenuInicial(chatId);
        } else {
            await client.sendMessage(chatId, `Por favor, informe seu nome completo (ex.: João Silva).`);
        }
        return;
    }

    // Fluxo de financiamento
    if (estado?.etapa === 'aguardandoEntrada') {
        if (isValidAmount(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.financiamento) dados.financiamento = {};
            dados.financiamento.entrada = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoParcelas', carroEscolhido: estado.carroEscolhido });
            await client.sendMessage(chatId, `Entrada de R$ ${textoOriginal} registrada. Quantas *parcelas* você pretende pagar?`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um valor válido para a entrada (ex.: 10000 ou 10000.00).`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoParcelas') {
        if (isValidParcels(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.financiamento) dados.financiamento = {};
            dados.financiamento.parcelas = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoCPF', carroEscolhido: estado.carroEscolhido });
            await client.sendMessage(chatId, `Parcelas registradas: ${textoOriginal}. Agora, informe seu *CPF* (apenas números):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um número válido de parcelas (ex.: 36).`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoCPF') {
        if (isValidCPF(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.financiamento) dados.financiamento = {};
            dados.financiamento.cpf = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoNascimento', carroEscolhido: estado.carroEscolhido });
            await client.sendMessage(chatId, `📅 Agora, informe sua *data de nascimento* (dd/mm/aaaa):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um CPF válido com 11 dígitos (apenas números).`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoNascimento') {
        if (isValidDate(textoOriginal)) {
            let dados = interessesClientes.get(chatId);
            if (dados && dados.financiamento) {
                dados.financiamento.nascimento = textoOriginal;
                interessesClientes.set(chatId, dados);
            }

            await client.sendMessage(chatId, `✅ Obrigado! Encaminhando para um de nossos consultores para finalizar a simulação. 😊`);
            await enviarRelatorioParaContatos(chatId);
            await client.sendMessage(chatId, `📨 Relatório enviado! Obrigado pelo seu tempo. 👋 Se precisar de mais alguma coisa, é só chamar!`);

            estadoCliente.delete(chatId);
            interessesClientes.delete(chatId);
            await wait(1000);
            estadoCliente.set(chatId, { etapa: 'menuInicial' });
            await enviarMenuInicial(chatId);
        } else {
            await client.sendMessage(chatId, `Por favor, informe a data de nascimento no formato dd/mm/aaaa (ex.: 01/01/1990).`);
        }
        return;
    }

    // Verificar se o usuário está na lista de carros
    if (estado?.etapa === 'aguardandoSelecaoCarro') {
        const carroEncontrado = carros.modelos.find(carro => texto.includes(carro.nome.toUpperCase()));
        if (carroEncontrado) {
            const dados = interessesClientes.get(chatId) || { interesses: [] };
            dados.interesses.push(carroEncontrado.nome);
            interessesClientes.set(chatId, dados);

            await client.sendMessage(chatId, `🔍 Aqui estão os detalhes do carro *${carroEncontrado.nome}*:\n\n🗓 Ano: ${carroEncontrado.ano}\n💲 Preço: ${carroEncontrado.preco}\nDescrição: ${carroEncontrado.descricao}`);
            await enviarImagensDoCarro(chatId, carroEncontrado);
            await wait(500);
            await client.sendMessage(chatId, `Deseja simular um financiamento deste carro?\nDigite "SIMULAR", ou envie outro nome de carro.`);
            estadoCliente.set(chatId, { etapa: 'aguardandoFinanciamento', carroEscolhido: carroEncontrado.nome });
        } else if (['1', '2', '3', '4', '5', '6'].includes(texto)) {
            estadoCliente.set(chatId, { etapa: 'menuInicial' });
            await processarOpcaoMenu(chatId, texto);
        } else {
            await client.sendMessage(chatId, `Carro não encontrado. Digite o nome de um carro válido ou escolha uma opção do menu (1-6).`);
            await wait(1000);
            await enviarListaCarros(chatId);
        }
        return;
    }

    // Processar opções do menu
    async function processarOpcaoMenu(chatId, texto) {
        if (texto === '1') {
            estadoCliente.set(chatId, { etapa: 'aguardandoSelecaoCarro' });
            await enviarListaCarros(chatId);

        } else if (texto === '2') {
            estadoCliente.set(chatId, { etapa: 'aguardandoNomeCarro' });
            await client.sendMessage(chatId, `Ótimo! Para simular um financiamento, me diga o *nome do carro* desejado:`);

        } else if (texto === '3') {
            estadoCliente.set(chatId, { etapa: 'aguardandoDiaVisita' });
            await client.sendMessage(chatId, `Perfeito! Para agendar uma visita, me diga o *dia* desejado (ex.: 30/05/2025 ou "amanhã"):`);

        } else if (texto === '4') {
            await client.sendMessage(chatId, `Claro! Um de nossos consultores humanos vai falar com você em instantes. 😊\n\nEnquanto isso, se quiser agilizar, pode chamar direto:\n📞 WhatsApp: +55 46 99137-0461`);
            await wait(1000);
            estadoCliente.set(chatId, { etapa: 'menuInicial' });
            await enviarMenuInicial(chatId);

        } else if (texto === '5') {
            await client.sendMessage(chatId, `🚗 Está pensando em trocar seu carro? Que legal! Podemos avaliar seu veículo na troca. Me envie as informações básicas dele (modelo, ano e estado de conservação) e uma foto se possível.`);
            await wait(1000);
            await client.sendMessage(chatId, `Em breve um de nossos consultores entrará em contato para fazer a avaliação completa.`);
            await wait(1000);
            estadoCliente.set(chatId, { etapa: 'menuInicial' });
            await enviarMenuInicial(chatId);

        } else if (texto === '6') {
            await client.sendMessage(chatId, `📤 Quer vender seu carro? Mande as informações principais (modelo, ano, estado geral e valor desejado). Fotos ajudam bastante!`);
            await wait(1000);
            await client.sendMessage(chatId, `Um consultor da Weiss Multimarcas entrará em contato com você em breve. 😊`);
            await wait(1000);
            estadoCliente.set(chatId, { etapa: 'menuInicial' });
            await enviarMenuInicial(chatId);

        } else {
            await client.sendMessage(chatId, `Desculpe, não entendi sua mensagem. Por favor, escolha uma das opções enviando o número correspondente (1-6).`);
            await wait(1000);
            estadoCliente.set(chatId, { etapa: 'menuInicial' });
            await enviarMenuInicial(chatId);
        }
    }

    // Tratar opções do menu ou mensagens inválidas
    if (estado?.etapa === 'menuInicial' || estado?.etapa === 'aguardandoFinanciamento') {
        if (estado?.etapa === 'aguardandoFinanciamento') {
            if (texto === 'SIMULAR') {
                let dados = interessesClientes.get(chatId) || { interesses: [] };
                if (!dados.financiamento) dados.financiamento = {};
                dados.financiamento.carroEscolhido = estado.carroEscolhido;
                interessesClientes.set(chatId, dados);

                estadoCliente.set(chatId, { etapa: 'aguardandoEntrada', carroEscolhido: estado.carroEscolhido });
                await client.sendMessage(chatId, `Ótimo, vamos simular o financiamento para o *${estado.carroEscolhido}*. Informe o valor da *entrada* disponível (R$):`);
                return;
            } else {
                const carroEncontrado = carros.modelos.find(carro => texto.includes(carro.nome.toUpperCase()));
                if (carroEncontrado) {
                    const dados = interessesClientes.get(chatId) || { interesses: [] };
                    dados.interesses.push(carroEncontrado.nome);
                    interessesClientes.set(chatId, dados);

                    await client.sendMessage(chatId, `🔍 Aqui estão os detalhes do carro *${carroEncontrado.nome}*:\n\n🗓 Ano: ${carroEncontrado.ano}\n💲 Preço: ${carroEncontrado.preco}\nDescrição: ${carroEncontrado.descricao}`);
                    await enviarImagensDoCarro(chatId, carroEncontrado);
                    await wait(500);
                    await client.sendMessage(chatId, `Deseja simular um financiamento deste carro?\nDigite "SIMULAR", ou envie outro nome de carro.`);
                    estadoCliente.set(chatId, { etapa: 'aguardandoFinanciamento', carroEscolhido: carroEncontrado.nome });
                    return;
                } else {
                    await client.sendMessage(chatId, `Carro não encontrado. Por favor, digite outro nome de carro válido ou envie "1" para ver a lista de modelos.`);
                    return;
                }
            }
        }
        await processarOpcaoMenu(chatId, texto);
    } else if (estado?.etapa === 'aguardandoNomeCarro') {
        const carroEncontrado = carros.modelos.find(carro => texto.includes(carro.nome.toUpperCase()));
        if (carroEncontrado) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.financiamento) dados.financiamento = {};
            dados.financiamento.carroEscolhido = carroEncontrado.nome;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoEntrada', carroEscolhido: carroEncontrado.nome });
            await client.sendMessage(chatId, `Ótimo, você escolheu o *${carroEncontrado.nome}*. Agora, informe o valor da *entrada* disponível (R$):`);
        } else {
            await client.sendMessage(chatId, `Carro não encontrado. Por favor, digite o nome de um carro válido ou envie "1" para ver a lista de modelos.`);
        }
    } else {
        const carroEncontrado = carros.modelos.find(carro => texto.includes(carro.nome.toUpperCase()));
        if (carroEncontrado) {
            const dados = interessesClientes.get(chatId) || { interesses: [] };
            dados.interesses.push(carroEncontrado.nome);
            interessesClientes.set(chatId, dados);

            await client.sendMessage(chatId, `🔍 Aqui estão os detalhes do carro *${carroEncontrado.nome}*:\n\n🗓 Ano: ${carroEncontrado.ano}\n💲 Preço: ${carroEncontrado.preco}\nDescrição: ${carroEncontrado.descricao}`);
            await enviarImagensDoCarro(chatId, carroEncontrado);
            await wait(500);
            await client.sendMessage(chatId, `Deseja simular um financiamento deste carro?\nDigite "SIMULAR", ou envie outro nome de carro.`);
            estadoCliente.set(chatId, { etapa: 'aguardandoFinanciamento', carroEscolhido: carroEncontrado.nome });
        } else {
            await client.sendMessage(chatId, `Desculpe, não entendi sua mensagem. Por favor, escolha uma das opções enviando o número correspondente (1-6).`);
            await wait(1000);
            estadoCliente.set(chatId, { etapa: 'menuInicial' });
            await enviarMenuInicial(chatId);
        }
    }
});

app.get('/qrcode', (req, res) => {
    if (!qrCodeUrl) return res.status(404).send('QR Code ainda não gerado');
    res.send(`<img src="${qrCodeUrl}" alt="QR Code para login WhatsApp" />`);
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}/qrcode`);
});
