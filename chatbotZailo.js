const fs = require('fs');
const path = require('path');  // Para trabalhar com caminhos de arquivos
const qrcode = require('qrcode');
const { Client } = require('whatsapp-web.js');
const client = new Client();
let qrCodeUrl = '';

client.on('qr', async qr => {
    qrCodeUrl = await qrcode.toDataURL(qr);
    const htmlContent = `
        <html>
        <body>
            <h1>Escaneie o QR Code para conectar</h1>
            <img src="${qrCodeUrl}" />
        </body>
        </html>
    `;

    // Defina o caminho para o arquivo HTML
    const filePath = path.join(__dirname, 'qrcode.html');  // Usa o __dirname para garantir o caminho absoluto

    // Escreve o conteúdo HTML no arquivo
    fs.writeFileSync(filePath, htmlContent);
    console.log(`QR Code gerado! Abra o arquivo qrcode.html no navegador. O arquivo está localizado em: ${filePath}`);
});

client.on('ready', () => {
    console.log('Atendente Virtual da Zailon está online!');
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
        await client.sendMessage(chatId, `Olá! Eu sou a atendente virtual da Zailon. Nosso sistema de chatbot pode ajudar seu negócio a automatizar atendimentos e melhorar a experiência dos clientes. Como posso te ajudar hoje?

1 - Quais são os benefícios do chatbot?
2 - Como funciona o chatbot da Zailon?
3 - Quero contratar um chatbot para meu negócio!`);
    }
    
    if (msg.body === '1') {
        await delay(1000);
        await client.sendMessage(chatId, `Os principais benefícios do nosso chatbot são:
✅ Atendimento automatizado 24h
✅ Respostas rápidas e personalizadas
✅ Redução de custos operacionais
✅ Aumento da satisfação dos clientes
✅ Facilidade de integração com WhatsApp e redes sociais

Gostaria de saber mais? Escolha uma opção:
2 - Como funciona o chatbot da Zailon?
3 - Quero contratar um chatbot para meu negócio!`);
    }
    
    if (msg.body === '2') {
        await delay(1000);
        await client.sendMessage(chatId, `Nosso chatbot funciona de forma simples e eficiente:
1️⃣ Coletamos as informações do seu negócio e personalizamos o chatbot
2️⃣ Ele responde automaticamente perguntas frequentes dos clientes
3️⃣ Encaminha atendimentos específicos para um atendente humano
4️⃣ Você pode ativar ou desativar o chatbot conforme a necessidade

Quer experimentar? Digite "3" para contratar um chatbot!`);
    }
    
    if (msg.body === '3') {
        await delay(1000);
        await client.sendMessage(chatId, `Ótima escolha! 🎉
Para contratar um chatbot, entre em contato conosco e um de nossos especialistas irá te atender.

📞 WhatsApp: +55 46 99137-0461

Aguardamos seu contato! 🚀`);
    }
});
