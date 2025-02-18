// leitor de qr code
const qrcode = require('qrcode-terminal');
const { Client, Buttons, List, MessageMedia } = require('whatsapp-web.js'); // Mudança Buttons
const client = new Client();
// serviço de leitura do qr code
client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});
// apos isso ele diz que foi tudo certo
client.on('ready', () => {
    console.log('Tudo certo! WhatsApp conectado.');
});
// E inicializa tudo 
client.initialize();

const delay = ms => new Promise(res => setTimeout(res, ms)); // Função que usamos para criar o delay entre uma ação e outra

// Funil

client.on('message', async msg => {

    if (msg.body.match(/(menu|Menu|dia|tarde|noite|oi|Oi|Olá|olá|ola|Ola|Opa|opa|Tudo|tudo|Fala|fala)/i) && msg.from.endsWith('@c.us')) {

        const chat = await msg.getChat();
        await delay(1000); //delay de 3 segundos
        await chat.sendStateTyping(); // Simulando Digitação
        await delay(1000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
        const contact = await msg.getContact(); //Pegando o contato
        const name = contact.pushname; //Pegando o nome do contato
        await client.sendMessage(msg.from,'Olá! '+ name.split(" ")[0] + 'Sou o assistente virtual do Jean. Como posso ajudá-lo hoje? Por favor, digite uma das opções abaixo:\n\n1 - Sou um contato do Jean\n2 - Não estou entendendo o pq que outra pessoa esta com o numero de alguém proxima a mim'); //Primeira mensagem de texto
        await delay(1000); //delay de 3 segundos
        await chat.sendStateTyping(); // Simulando Digitação
        await delay(2000); //Delay de 5 segundos
    }

    if (msg.body !== null && msg.body === '1' && msg.from.endsWith('@c.us')) {
        const chat = await msg.getChat();
        await delay(1000); //delay de 3 segundos
        await chat.sendStateTyping(); // Simulando Digitação
        await delay(1000);
        await client.sendMessage(msg.from, 'Perfeito pode mandar sua mensagem, assim que possivel o Jean irá te retornar');
    }

    if (msg.body !== null && msg.body === '2' && msg.from.endsWith('@c.us')) {
        const chat = await msg.getChat();
        await delay(1000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
        await chat.sendStateTyping(); // Simulando Digitação
        await delay(1000);
        await client.sendMessage(msg.from, 'Oi! Sei que pode parecer estranho, mas agora estou com um número que era de alguém próximo a você. Comprei ele recentemente e a operadora acabou me repassando. Espero que esteja tendo um dia maravilhoso e que sua semana seja incrível!');
    }

    // if (msg.body !== null && msg.body === '3' && msg.from.endsWith('@c.us')) {
    //     const chat = await msg.getChat();


    //     await delay(3000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
    //     await chat.sendStateTyping(); // Simulando Digitação
    //     await delay(3000);
    //     await client.sendMessage(msg.from, 'Sorteio de em prêmios todo ano.\n\nAtendimento médico ilimitado 24h por dia.\n\nReceitas de medicamentos');
        
    //     await delay(3000); //delay de 3 segundos
    //     await chat.sendStateTyping(); // Simulando Digitação
    //     await delay(3000);
    //     await client.sendMessage(msg.from, 'Link para cadastro: https://site.com');

    // }

    // if (msg.body !== null && msg.body === '4' && msg.from.endsWith('@c.us')) {
    //     const chat = await msg.getChat();

    //     await delay(3000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
    //     await chat.sendStateTyping(); // Simulando Digitação
    //     await delay(3000);
    //     await client.sendMessage(msg.from, 'Você pode aderir aos nossos planos diretamente pelo nosso site ou pelo WhatsApp.\n\nApós a adesão, você terá acesso imediato');


    //     await delay(3000); //delay de 3 segundos
    //     await chat.sendStateTyping(); // Simulando Digitação
    //     await delay(3000);
    //     await client.sendMessage(msg.from, 'Link para cadastro: https://site.com');


    // }

    // if (msg.body !== null && msg.body === '5' && msg.from.endsWith('@c.us')) {
    //     const chat = await msg.getChat();

    //     await delay(3000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
    //     await chat.sendStateTyping(); // Simulando Digitação
    //     await delay(3000);
    //     await client.sendMessage(msg.from, 'Se você tiver outras dúvidas ou precisar de mais informações, por favor, fale aqui nesse whatsapp ou visite nosso site: https://site.com ');


    // }
});