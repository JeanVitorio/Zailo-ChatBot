const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const client = new Client();

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Chatbot da Pizzaria conectado!');
});

client.initialize();

let pedidos = {};
let enderecos = {};

const cardapio = {
    "1A": { nome: "Pizza Margherita M", preco: 35 },
    "1B": { nome: "Pizza Margherita G", preco: 45 },
    "1C": { nome: "Pizza Margherita GG", preco: 55 },
    "2A": { nome: "Pizza Calabresa M", preco: 38 },
    "2B": { nome: "Pizza Calabresa G", preco: 48 },
    "2C": { nome: "Pizza Calabresa GG", preco: 58 },
    "3A": { nome: "Pizza Portuguesa M", preco: 40 },
    "3B": { nome: "Pizza Portuguesa G", preco: 50 },
    "3C": { nome: "Pizza Portuguesa GG", preco: 60 },
    "4A": { nome: "Pizza Quatro Queijos M", preco: 42 },
    "4B": { nome: "Pizza Quatro Queijos G", preco: 52 },
    "4C": { nome: "Pizza Quatro Queijos GG", preco: 62 }
};

const bebidas = {
    "coca-cola": { nome: "Coca-Cola", preco: 8 },
    "coca": { nome: "Coca-Cola", preco: 8 },
    "cola": { nome: "Coca-Cola", preco: 8 },
    "pepsi": { nome: "Pepsi", preco: 7 },
    "guarana": { nome: "Guaraná", preco: 6 }
};

client.on('message', async msg => {
    const chatId = msg.from;

    if (msg.body.match(/(menu|cardápio|pedido|pizza|oi|olá|opa)/i) && chatId.endsWith('@c.us')) {
        const chat = await msg.getChat();
        const contact = await msg.getContact();
        const name = contact.pushname;
        pedidos[chatId] = [];

        await client.sendMessage(chatId, `Olá, ${name.split(" ")[0]}! Escolha uma das opções abaixo:
        
1 - Ver o cardápio 🍕
2 - Fazer um pedido 📦
3 - Consultar tempo de entrega 🚀
4 - Falar com um atendente 👨‍💼`);
    }

    if (msg.body === '1' && chatId.endsWith('@c.us')) {
        await client.sendMessage(chatId, `Aqui está nosso cardápio 🍕:

` +
            `1 - Pizza Margherita - R$ 35,00\n` +
            `2 - Pizza Calabresa - R$ 38,00\n` +
            `3 - Pizza Portuguesa - R$ 40,00\n` +
            `4 - Pizza Quatro Queijos - R$ 42,00\n\n` +
            `Escolha o tamanho:\nA - M | B - G | C - GG\n\n` +
            `Faça seu pedido no formato "1A, 2C"`);
    }

    if (msg.body.match(/^([1-4][A-C],?\s?)+$/i) && chatId.endsWith('@c.us')) {
        const pedidosCliente = msg.body.toUpperCase().split(/,\s?/);
        let total = 0;
        pedidos[chatId] = pedidosCliente.map(pedido => {
            if (cardapio[pedido]) {
                total += cardapio[pedido].preco;
                return cardapio[pedido].nome;
            }
        }).filter(Boolean);
        
        await client.sendMessage(chatId, `Você deseja adicionar alguma bebida? Temos:\n` +
            `- Coca-Cola (R$ 8,00)\n` +
            `- Pepsi (R$ 7,00)\n` +
            `- Guaraná (R$ 6,00)\n\n` +
            `Digite o nome da bebida ou "Não" para finalizar.`);
        
        pedidos[chatId].total = total; // Armazena o total até o momento
    }

    const bebidaPedido = msg.body.toLowerCase();
    
    if (bebidaPedido in bebidas && chatId.endsWith('@c.us')) {
        const bebida = bebidas[bebidaPedido];
        await client.sendMessage(chatId, `Você escolheu ${bebida.nome}. Qual o tamanho da bebida?\n` +
            `1 - Pequena\n` +
            `2 - Média\n` +
            `3 - Grande\n\n` +
            `Digite o número do tamanho.`);
        
        pedidos[chatId].bebida = bebida; // Armazena a bebida escolhida
    }

    if (msg.body.match(/[1-3]/) && pedidos[chatId].bebida) {
        const tamanho = msg.body;
        const bebida = pedidos[chatId].bebida;
        
        pedidos[chatId].push(`${bebida.nome} (Tamanho ${tamanho})`);
        pedidos[chatId].total += bebida.preco; // Adiciona o preço da bebida ao total
        
        await client.sendMessage(chatId, `Ótimo! Adicionamos ${bebida.nome} (Tamanho ${tamanho}) ao seu pedido. Deseja mais alguma coisa? (Sim/Não)`);
        
        delete pedidos[chatId].bebida; // Remove a bebida da escolha
    }

    const respostaSimNao = msg.body.toLowerCase();

    if ((respostaSimNao === 'não' || respostaSimNao === 'nao') && chatId.endsWith('@c.us')) {
        const pedidoConfirmado = pedidos[chatId].join(', ');
        const total = pedidos[chatId].total; // Obtem o total final
        await client.sendMessage(chatId, `Confirmando seu pedido!\nVocê pediu: ${pedidoConfirmado}\nValor total: R$ ${total},00\nPor favor, digite "Entrega" ou "Retirada".`);
    }

    if ((respostaSimNao === 'sim') && chatId.endsWith('@c.us')) {
        await client.sendMessage(chatId, `Ótimo! O que mais você gostaria de adicionar ao seu pedido?`);
    }

    if (respostaSimNao === 'retirada' && chatId.endsWith('@c.us')) {
        await client.sendMessage(chatId, 'Seu pedido estará pronto para retirada em aproximadamente 40 minutos. Obrigado pela preferência! 🍕😊');
        delete pedidos[chatId];
    }

    if (respostaSimNao === 'entrega' && chatId.endsWith('@c.us')) {
        await client.sendMessage(chatId, 'Por favor, informe seu endereço com Rua, Bairro e Número.');
    }

    if (msg.body.match(/(rua|bairro|número|numero)/i) && chatId.endsWith('@c.us')) {
        enderecos[chatId] = msg.body;
        const pedidoConfirmado = pedidos[chatId].join(', ');
        const total = pedidos[chatId].total; // Obtem o total final
        
        await client.sendMessage(chatId, `Obrigado! Seu pedido: ${pedidoConfirmado} será entregue em aproximadamente 1 hora no endereço:\n${enderecos[chatId]}\nValor total: R$ ${total},00\n\nAgradecemos a preferência! 🍕😊`);
        delete pedidos[chatId];
        delete enderecos[chatId];
    }
});
