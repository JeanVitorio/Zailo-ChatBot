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

// Carregar dados dos carros e contatos
const carros = JSON.parse(fs.readFileSync('carros.json', 'utf-8'));

// Controle de estado e bloqueio
const bloquearChats = new Map(); // chatId => timestamp
const estadoCliente = new Map(); // chatId => estado ou objeto
const interessesClientes = new Map(); // chatId => { interesses: [], financiamento: {} }

function estaBloqueado(chatId) {
    const desbloqueio = bloquearChats.get(chatId);
    return desbloqueio && Date.now() < desbloqueio;
}

function bloquearPor24h(chatId) {
    const desbloqueio = Date.now() + 24 * 60 * 60 * 1000;
    bloquearChats.set(chatId, desbloqueio);
}

// Envia imagens do carro
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

// Envia relatório para os contatos
async function enviarRelatorioParaContatos(chatId) {
    const dados = interessesClientes.get(chatId);
    if (!dados) return;

    let mensagem = `📊 *Novo Relatório de Cliente:*\n\n📱 Cliente: ${chatId}\n`;

    if (dados.interesses?.length) {
        mensagem += `\n🚗 *Carros visualizados:*\n`;
        dados.interesses.forEach((nome, i) => {
            mensagem += `  ${i + 1}. ${nome}\n`;
        });
    }

    if (dados.financiamento) {
        mensagem += `\n💰 *Solicitou simulação de financiamento:*\n`;
        mensagem += `CPF: ${dados.financiamento.cpf}\n`;
        mensagem += `Nascimento: ${dados.financiamento.nascimento}\n`;
    }

    for (const contato of carros.numeros_para_contato) {
        const numero = contato.numero.includes('@c.us') ? contato.numero : `${contato.numero}@c.us`;
        try {
            await client.sendMessage(numero, mensagem);
            console.log(`✅ Relatório enviado para ${contato.nome}`);
        } catch (err) {
            console.error(`Erro ao enviar relatório para ${contato.nome}:`, err);
        }
    }
}

client.on('qr', async qr => {
    qrCodeUrl = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
    console.log('✅ Vendedor Virtual da Zailon está online no WhatsApp!');
});

client.initialize();

client.on('message', async msg => {
    const chatId = msg.from;
    const textoOriginal = msg.body.trim();
    const texto = textoOriginal.toUpperCase();

    if (estaBloqueado(chatId)) return;

    const estado = estadoCliente.get(chatId);

    if (estado === 'aguardandoCPF') {
        estadoCliente.set(chatId, { etapa: 'aguardandoNascimento', cpf: textoOriginal });

        let dados = interessesClientes.get(chatId) || { interesses: [] };
        dados.financiamento = { cpf: textoOriginal };
        interessesClientes.set(chatId, dados);

        await client.sendMessage(chatId, '📅 Agora, por favor informe sua *data de nascimento* (dd/mm/aaaa):');
        return;
    }

    if (estado?.etapa === 'aguardandoNascimento') {
        const dados = interessesClientes.get(chatId);
        if (dados && dados.financiamento) {
            dados.financiamento.nascimento = textoOriginal;
            await enviarRelatorioParaContatos(chatId);
        }

        await client.sendMessage(chatId, '✅ Obrigado! Encaminhando para um de nossos consultores para finalizar a simulação. 😊');
        estadoCliente.delete(chatId);
        bloquearPor24h(chatId);
        return;
    }

    if (texto.match(/^(OI|OLÁ|BOM DIA|BOA TARDE|BOA NOITE)$/i) && chatId.endsWith('@c.us')) {
        await delay(1000);
        await client.sendMessage(chatId, `Olá! 👋 Seja muito bem-vindo à nossa loja de veículos! Me chamo Rafa, sou seu consultor virtual. 🚗✨

Posso te ajudar com:
1 - Ver modelos disponíveis
2 - Quero um carro financiado
3 - Quero agendar uma visita
4 - Falar com um vendedor humano`);
    } else if (texto === '1') {
        let lista = `Temos alguns modelos incríveis disponíveis no momento:\n\n`;
        for (const carro of carros.modelos) {
            lista += `🚘 *${carro.nome}* - ${carro.ano} - ${carro.preco}\n`;
        }
        lista += `\nDigite o nome do carro que te interessou ou:\n2 - Quero um carro financiado\n3 - Quero agendar uma visita`;
        await delay(1000);
        await client.sendMessage(chatId, lista);
    } else if (texto === '2') {
        await delay(1000);
        await client.sendMessage(chatId, `Ótimo! Trabalhamos com várias financeiras e facilitamos tudo pra você.

📋 Para simular um financiamento, me diga:
- Nome do carro desejado
- Entrada disponível (R$)
- Parcelas que pretende pagar

Ou, se preferir, digite:
3 - Quero agendar uma visita
4 - Falar com um vendedor humano`);
    } else if (texto === '3') {
        await delay(1000);
        await client.sendMessage(chatId, `Perfeito! Para agendar uma visita, me diga:
📍 Dia e horário desejado  
👤 Seu nome completo`);
    } else if (texto === '4') {
        await delay(1000);
        await client.sendMessage(chatId, `Claro! Um de nossos consultores humanos vai falar com você em instantes. 😊

Enquanto isso, se quiser agilizar, pode chamar direto:
📞 WhatsApp: +55 46 99137-0461`);
        bloquearPor24h(chatId);
    } else {
        const carro = carros.modelos.find(c => c.nome.toLowerCase() === textoOriginal.toLowerCase());
        if (carro) {
            await delay(1000);
            await client.sendMessage(chatId, `📄 *${carro.nome}* - ${carro.ano} - ${carro.preco}\n\n${carro.descricao}`);
            await enviarImagensDoCarro(chatId, carro);

            // Salvar interesse
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.interesses.includes(carro.nome)) {
                dados.interesses.push(carro.nome);
            }
            interessesClientes.set(chatId, dados);

            await delay(1000);
            await client.sendMessage(chatId, `Deseja:
🅰️ A - Simular um financiamento  
🅱️ B - Falar com um atendente  
🇨 C - Ver outro carro

Responda com a letra da opção.`);
        } else if (texto === 'A') {
            estadoCliente.set(chatId, 'aguardandoCPF');
            await client.sendMessage(chatId, `Para começar a simulação, por favor me informe seu *CPF* (apenas números):`);
        } else if (texto === 'B') {
            await client.sendMessage(chatId, `Certo! Em instantes, um de nossos atendentes humanos vai assumir esta conversa.`);
            await enviarRelatorioParaContatos(chatId);
            bloquearPor24h(chatId);
        } else if (texto === 'C') {
            await client.sendMessage(chatId, `Claro! Digite o nome de outro carro que deseja ver ou envie "1" para ver a lista novamente.`);
        }
    }
});

// Exibir o QR Code
app.get('/qrcode', (req, res) => {
    if (qrCodeUrl) {
        res.send(`<html><body><h1>Escaneie o QR Code para conectar</h1><img src="${qrCodeUrl}" /></body></html>`);
    } else {
        res.send('<html><body><h1>Aguardando QR Code...</h1></body></html>');
    }
});

app.listen(port, () => {
    console.log(`🔗 Acesse http://localhost:${port}/qrcode para escanear o QR Code`);
});
