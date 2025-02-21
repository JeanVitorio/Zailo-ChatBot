const qrcode = require('qrcode');  // Usando a versão completa da biblioteca qrcode
const { Client } = require('whatsapp-web.js');
const client = new Client();

// Função para exibir o QR Code como uma única string no log
function logQRCode(qrCodeString) {
    console.log('QR Code gerado:');
    console.log(qrCodeString);  // Exibe o QR Code gerado em formato de string
}

client.on('qr', async (qr) => {
    // Gerando o QR Code como uma string base64
    const qrCodeString = await qrcode.toString(qr, { type: 'terminal' });
    logQRCode(qrCodeString);  // Chama a função para exibir o QR Code no log
});

client.on('ready', () => {
    console.log('Atendente Virtual da Zailon está online!');
    
    // Intervalo de 40 segundos para simular atividade
    setInterval(() => {
        simulateFakeActivity(); // Função para simular a atividade
    }, 40000);  // 40 segundos
});

client.initialize();

client.on('message', async msg => {
    const chatId = msg.from;

    // Resposta otimizada para a saudação inicial
    if (msg.body.match(/(oi|olá|bom dia|boa tarde|boa noite)/i) && chatId.endsWith('@c.us')) {
        const chat = await msg.getChat();
        await chat.sendStateTyping();  // Usado para mostrar que o bot está "digitando"
        await client.sendMessage(chatId, `Olá! Eu sou a atendente virtual da Zailon. Nosso sistema de chatbot pode ajudar seu negócio a automatizar atendimentos e melhorar a experiência dos clientes. Como posso te ajudar hoje?

1 - Quais são os benefícios do chatbot?
2 - Como funciona o chatbot da Zailon?
3 - Quero contratar um chatbot para meu negócio!`);
    }

    // Resposta otimizada para "benefícios do chatbot"
    if (msg.body === '1') {
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

    // Resposta otimizada para "como funciona"
    if (msg.body === '2') {
        await client.sendMessage(chatId, `Nosso chatbot funciona de forma simples e eficiente:
1️⃣ Coletamos as informações do seu negócio e personalizamos o chatbot
2️⃣ Ele responde automaticamente perguntas frequentes dos clientes
3️⃣ Encaminha atendimentos específicos para um atendente humano
4️⃣ Você pode ativar ou desativar o chatbot conforme a necessidade

Quer experimentar? Digite "3" para contratar um chatbot!`);
    }

    // Resposta otimizada para "contratar chatbot"
    if (msg.body === '3') {
        await client.sendMessage(chatId, `Ótima escolha! 🎉
Para contratar um chatbot, entre em contato conosco e um de nossos especialistas irá te atender.

📞 WhatsApp: +55 46 99137-0461

Aguardamos seu contato! 🚀`);
    }
});

// Função para simular a atividade falsa
async function simulateFakeActivity() {
    try {
        // Use um chat válido para simulação de "digitando"
        const fakeChatId = '5531999999999@c.us';  // Número fictício
        const chat = await client.getChatById(fakeChatId);

        // Simula o ato de "digitando" no chat fictício
        await chat.sendStateTyping();
    } catch (error) {
        console.error("Erro ao tentar simular atividade:", error);
    }
}
