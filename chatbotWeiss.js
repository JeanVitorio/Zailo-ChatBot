const express = require('express');
const qrcode = require('qrcode');
const { Client } = require('whatsapp-web.js');

const app = express();
const port = 3000;
const client = new Client();
let qrCodeUrl = '';

client.on('qr', async qr => {
    console.log('📱 Aguardando escaneamento do QR Code...');
    qrCodeUrl = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
    console.log('✅ Vendedor Virtual da Zailon está online no WhatsApp!');
});

client.initialize();

const delay = ms => new Promise(res => setTimeout(res, ms));

client.on('message', async msg => {
    const chatId = msg.from;

    if (msg.body.match(/(oi|olá|bom dia|boa tarde|boa noite)/i) && chatId.endsWith('@c.us')) {
        const chat = await msg.getChat();
        await delay(1000);
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(chatId, `Olá! 👋 Seja muito bem-vindo à nossa loja de veículos! Me chamo Rafa, sou seu consultor virtual. 🚗✨

Posso te ajudar com:
1 - Ver modelos disponíveis
2 - Quero um carro financiado
3 - Quero agendar uma visita
4 - Falar com um vendedor humano`);
    }

    if (msg.body === '1') {
        await delay(1000);
        await client.sendMessage(chatId, `Temos alguns modelos incríveis disponíveis no momento:

🚘 *Volkswagen Gol 1.6* - 2020 - R$ 45.900  
🚗 *Chevrolet Onix LT* - 2021 - R$ 58.700  
🚙 *Jeep Renegade Sport* - 2022 - R$ 89.900  
🚘 *Fiat Argo Drive 1.0* - 2021 - R$ 52.000

Digite o nome do carro que te interessou ou:
2 - Quero um carro financiado
3 - Quero agendar uma visita`);
    }

    if (msg.body === '2') {
        await delay(1000);
        await client.sendMessage(chatId, `Ótimo! Trabalhamos com várias financeiras e facilitamos tudo pra você.

📋 Para simular um financiamento, me diga:
- Nome do carro desejado
- Entrada disponível (R$)
- Parcelas que pretende pagar

Ou, se preferir, digite:
3 - Quero agendar uma visita
4 - Falar com um vendedor humano`);
    }

    if (msg.body === '3') {
        await delay(1000);
        await client.sendMessage(chatId, `Perfeito! Para agendar uma visita, me diga:
📍 Dia e horário desejado  
👤 Seu nome completo

Vamos reservar um horário exclusivo para você conhecer os carros com tranquilidade! 🚗💬`);
    }

    if (msg.body === '4') {
        await delay(1000);
        await client.sendMessage(chatId, `Claro! Um de nossos consultores humanos vai falar com você em instantes. 😊

Enquanto isso, se quiser agilizar, pode chamar direto:
📞 WhatsApp: +55 46 99137-0461`);
    }
});

// Servidor para exibir o QR Code
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
