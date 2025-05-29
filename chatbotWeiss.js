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

const bloquearChats = new Map();
const estadoCliente = new Map();
const interessesClientes = new Map();
const ultimoBoasVindas = new Map();

function estaBloqueado(chatId) {
    const desbloqueio = bloquearChats.get(chatId);
    return desbloqueio && Date.now() < desbloqueio;
}

function bloquearPor24h(chatId) {
    const desbloqueio = Date.now() + 24 * 60 * 60 * 1000;
    bloquearChats.set(chatId, desbloqueio);
}

function podeEnviarBoasVindas(chatId) {
    const ultimoEnvio = ultimoBoasVindas.get(chatId);
    if (!ultimoEnvio) return true;
    return (Date.now() - ultimoEnvio) > 24 * 60 * 60 * 1000;
}

function registrarBoasVindas(chatId) {
    ultimoBoasVindas.set(chatId, Date.now());
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
        mensagem += `CPF: ${dados.financiamento.cpf}\n`;
        mensagem += `Nascimento: ${dados.financiamento.nascimento}\n`;
    }

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

client.on('message', async msg => {
    const chatId = msg.from;
    const textoOriginal = msg.body.trim();
    const texto = textoOriginal.toUpperCase();

    if (estaBloqueado(chatId)) return;

    const estado = estadoCliente.get(chatId);

    if (estado?.etapa === 'aguardandoFinanciamento' && texto === 'SIMULAR') {
        estadoCliente.set(chatId, 'aguardandoCPF');

        let dados = interessesClientes.get(chatId) || { interesses: [] };
        if (!dados.financiamento) dados.financiamento = {};
        dados.financiamento.carroEscolhido = estado.carroEscolhido;
        interessesClientes.set(chatId, dados);

        await client.sendMessage(chatId, '📝 Vamos simular! Primeiro, me informe seu *CPF* (apenas números):');
        return;
    }

    if (estado === 'aguardandoCPF') {
        estadoCliente.set(chatId, { etapa: 'aguardandoNascimento', cpf: textoOriginal });

        let dados = interessesClientes.get(chatId) || { interesses: [] };
        if (!dados.financiamento) dados.financiamento = {};
        dados.financiamento.cpf = textoOriginal;
        interessesClientes.set(chatId, dados);

        await client.sendMessage(chatId, '📅 Agora, por favor informe sua *data de nascimento* (dd/mm/aaaa):');
        return;
    }

    if (estado?.etapa === 'aguardandoNascimento') {
        const dados = interessesClientes.get(chatId);
        if (dados && dados.financiamento) {
            dados.financiamento.nascimento = textoOriginal;
            interessesClientes.set(chatId, dados);
        }

        await client.sendMessage(chatId, '✅ Obrigado! Encaminhando para um de nossos consultores para finalizar a simulação. 😊');

        await wait(1000);
        await client.sendMessage(chatId, `Deseja fazer outra simulação ou encerrar o atendimento?\nDigite:\nS - Para simular outro carro\nF - Para finalizar`);

        estadoCliente.set(chatId, 'aguardandoFinalizacao');
        return;
    }

    if (estado === 'aguardandoFinalizacao') {
        if (texto === 'S') {
            let dados = interessesClientes.get(chatId);
            if (dados?.financiamento) {
                delete dados.financiamento;
                interessesClientes.set(chatId, dados);
            }
            estadoCliente.set(chatId, null);
            await client.sendMessage(chatId, `Claro! Digite o nome de outro carro que deseja ver ou envie "1" para ver a lista novamente.`);
        } else if (texto === 'F') {
            await enviarRelatorioParaContatos(chatId);
            await client.sendMessage(chatId, `📨 Relatório enviado! Obrigado pelo seu tempo. 👋 Se precisar de mais alguma coisa, é só chamar!`);

            estadoCliente.delete(chatId);
            interessesClientes.delete(chatId);
            bloquearPor24h(chatId);
        } else {
            await client.sendMessage(chatId, `Por favor, responda com:\nS - Para simular outro carro\nF - Para finalizar`);
        }
        return;
    }

    // ✅ CORRIGIDO: Enviar boas-vindas só uma vez a cada 24h com return
    if (!estado && chatId.endsWith('@c.us') && podeEnviarBoasVindas(chatId)) {
        await wait(1000);
        await client.sendMessage(chatId,
            `Olá! 👋 Seja muito bem-vindo à 🤩Weiss Multimarcas 🤩!\nMe chamo Zailon, sou seu consultor virtual. 🚗✨\n\nPosso te ajudar com:\n1 - Ver modelos disponíveis\n2 - Quero um carro financiado\n3 - Quero agendar uma visita\n4 - Falar com um vendedor humano\n5 - Quero trocar meu carro\n6 - Quero vender meu carro`
        );
        registrarBoasVindas(chatId);
        return; // ✅ ESSENCIAL para evitar resposta duplicada
    }

    if (texto === '1') {
        let lista = `Temos alguns modelos incríveis disponíveis no momento:\n\n`;
        for (const carro of carros.modelos) {
            lista += `🚘 *${carro.nome}* - ${carro.preco}\n`;
        }
        lista += `\nDigite o nome do carro que te interessou ou:\n2 - Quero um carro financiado\n3 - Quero agendar uma visita`;
        await wait(1000);
        await client.sendMessage(chatId, lista);

    } else if (texto === '2') {
        await wait(1000);
        await client.sendMessage(chatId, `Ótimo! Trabalhamos com várias financeiras e facilitamos tudo pra você.\n\n📋 Para simular um financiamento, me diga:\n- Nome do carro desejado\n- Entrada disponível (R$)\n- Parcelas que pretende pagar`);

    } else if (texto === '3') {
        await wait(1000);
        await client.sendMessage(chatId, `Perfeito! Para agendar uma visita, me diga:\n📍 Dia e horário desejado  \n👤 Seu nome completo`);

    } else if (texto === '4') {
        await wait(1000);
        await client.sendMessage(chatId, `Claro! Um de nossos consultores humanos vai falar com você em instantes. 😊\n\nEnquanto isso, se quiser agilizar, pode chamar direto:\n📞 WhatsApp: +55 46 99137-0461`);
        bloquearPor24h(chatId);

    } else if (texto === '5') {
        await client.sendMessage(chatId, '🚗 Está pensando em trocar seu carro? Que legal! Podemos avaliar seu veículo na troca. Me envie as informações básicas dele (modelo, ano e estado de conservação) e uma foto se possível.');
        await wait(1000);
        await client.sendMessage(chatId, 'Em breve um de nossos consultores entrará em contato para fazer a avaliação completa.');

    } else if (texto === '6') {
        await client.sendMessage(chatId, '📤 Quer vender seu carro? Mande as informações principais (modelo, ano, estado geral e valor desejado). Fotos ajudam bastante!');
        await wait(1000);
        await client.sendMessage(chatId, 'Um consultor da Weiss Multimarcas entrará em contato com você em breve. 😊');

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
            await client.sendMessage(chatId, `Desculpe, não entendi sua mensagem. Por favor, escolha uma das opções enviando o número correspondente.`);
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
