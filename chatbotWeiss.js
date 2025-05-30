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
    return /^\d{2}\/\d{2}\/\d{4}$/.test(date) || /^[a-zA-Z\s]+$/.test(date);
}

function isValidVisitTime(time) {
    return /^\d{2}:\d{2}$/.test(time);
}

function isValidFullName(name) {
    return name.trim().split(/\s+/).length >= 2 && /^[a-zA-Z\s]+$/.test(name);
}

function isValidModel(model) {
    return /^[a-zA-Z0-9\s]+$/.test(model) && model.trim().length > 0;
}

function isValidYear(year) {
    return /^\d{4}$/.test(year) && parseInt(year) >= 1900 && parseInt(year) <= new Date().getFullYear() + 1;
}

function isValidCondition(condition) {
    return condition.trim().length > 0;
}

async function salvarFoto(msg, chatId, tipo) {
    if (msg.hasMedia) {
        try {
            const media = await msg.downloadMedia();
            const fileName = `${chatId}_${tipo}_${Date.now()}.jpg`;
            const filePath = path.join(__dirname, 'Uploads', fileName);
            fs.mkdirSync(path.join(__dirname, 'Uploads'), { recursive: true });
            fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
            return fileName;
        } catch (err) {
            console.error(`Erro ao salvar foto de ${tipo}:`, err);
            return null;
        }
    }
    return false;
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

    if (dados.troca) {
        mensagem += `\n🔄 *Solicitou troca de veículo:*\n`;
        mensagem += `Modelo: ${dados.troca.modelo || 'Não informado'}\n`;
        mensagem += `Ano: ${dados.troca.ano || 'Não informado'}\n`;
        mensagem += `Estado: ${dados.troca.estado || 'Não informado'}\n`;
        mensagem += `Foto: ${dados.troca.foto || 'Não enviada'}\n`;
    }

    if (dados.venda) {
        mensagem += `\n📤 *Solicitou venda de veículo:*\n`;
        mensagem += `Modelo: ${dados.venda.modelo || 'Não informado'}\n`;
        mensagem += `Ano: ${dados.venda.ano || 'Não informado'}\n`;
        mensagem += `Estado: ${dados.venda.estado || 'Não informado'}\n`;
        mensagem += `Preço desejado: R$ ${dados.venda.preco || 'Não informado'}\n`;
        mensagem += `Foto: ${dados.venda.foto || 'Não enviada'}\n`;
    }

    mensagem += `\n*⚠️ Atenção:* Este relatório contém informações sensíveis. Garanta conformidade com a LGPD e não compartilhe sem autorização.`;

    for (const contato of carros.numeros_para_contato) {
        let numeroWhatsApp = contato.numero;
        if (!numeroWhatsApp.includes('@c.us')) {
            numeroWhatsApp = numeroWhatsApp.replace(/\D/g, '') + '@c.us';
        }
        try {
            // Enviar o texto do relatório
            await client.sendMessage(numeroWhatsApp, mensagem);

            // Enviar foto de troca, se existir
            if (dados.troca?.foto) {
                const fotoPath = path.join(__dirname, 'Uploads', dados.troca.foto);
                if (fs.existsSync(fotoPath)) {
                    const media = MessageMedia.fromFilePath(fotoPath);
                    await client.sendMessage(numeroWhatsApp, media, { caption: 'Foto do veículo (Troca)' });
                } else {
                    console.error(`Foto de troca não encontrada: ${fotoPath}`);
                }
            }

            // Enviar foto de venda, se existir
            if (dados.venda?.foto) {
                const fotoPath = path.join(__dirname, 'Uploads', dados.venda.foto);
                if (fs.existsSync(fotoPath)) {
                    const media = MessageMedia.fromFilePath(fotoPath);
                    await client.sendMessage(numeroWhatsApp, media, { caption: 'Foto do veículo (Venda)' });
                } else {
                    console.error(`Foto de venda não encontrada: ${fotoPath}`);
                }
            }

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

    // Fluxo de troca (opção 5)
    if (estado?.etapa === 'aguardandoModeloTroca') {
        if (isValidModel(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.troca) dados.troca = {};
            dados.troca.modelo = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoAnoTroca' });
            await client.sendMessage(chatId, `Modelo registrado: ${textoOriginal}. Agora, informe o *ano* do veículo (ex.: 2018):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um modelo válido (ex.: Honda Civic).`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoAnoTroca') {
        if (isValidYear(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.troca) dados.troca = {};
            dados.troca.ano = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoEstadoTroca' });
            await client.sendMessage(chatId, `Ano registrado: ${textoOriginal}. Descreva o *estado de conservação* do veículo (ex.: Bom estado, revisado):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um ano válido (ex.: 2018).`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoEstadoTroca') {
        if (isValidCondition(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.troca) dados.troca = {};
            dados.troca.estado = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoFotoTroca' });
            await client.sendMessage(chatId, `Estado registrado: ${textoOriginal}. Envie uma *foto* do veículo ou digite "NÃO" para pular:`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe o estado de conservação (ex.: Bom estado, revisado).`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoFotoTroca') {
        if (texto === 'NÃO' || msg.hasMedia) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.troca) dados.troca = {};
            if (msg.hasMedia) {
                const fotoPath = await salvarFoto(msg, chatId, 'troca');
                if (fotoPath) dados.troca.foto = fotoPath;
            }
            interessesClientes.set(chatId, dados);

            await client.sendMessage(chatId, `✅ Solicitação de troca enviada! Um consultor entrará em contato para avaliar seu veículo. 😊`);
            await enviarRelatorioParaContatos(chatId);
            await client.sendMessage(chatId, `📨 Relatório enviado! Obrigado pelo seu tempo. 👋 Se precisar de mais alguma coisa, é só chamar!`);

            estadoCliente.delete(chatId);
            interessesClientes.delete(chatId);
            await wait(1000);
            estadoCliente.set(chatId, { etapa: 'menuInicial' });
            await enviarMenuInicial(chatId);
        } else {
            await client.sendMessage(chatId, `Por favor, envie uma foto do veículo ou digite "NÃO" para pular.`);
        }
        return;
    }

    // Fluxo de venda (opção 6)
    if (estado?.etapa === 'aguardandoModeloVenda') {
        if (isValidModel(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.venda) dados.venda = {};
            dados.venda.modelo = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoAnoVenda' });
            await client.sendMessage(chatId, `Modelo registrado: ${textoOriginal}. Agora, informe o *ano* do veículo (ex.: 2020):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um modelo válido (ex.: Toyota Corolla).`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoAnoVenda') {
        if (isValidYear(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.venda) dados.venda = {};
            dados.venda.ano = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoEstadoVenda' });
            await client.sendMessage(chatId, `Ano registrado: ${textoOriginal}. Descreva o *estado de conservação* do veículo (ex.: Ótimo estado, único dono):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um ano válido (ex.: 2020).`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoEstadoVenda') {
        if (isValidCondition(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.venda) dados.venda = {};
            dados.venda.estado = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoPrecoVenda' });
            await client.sendMessage(chatId, `Estado registrado: ${textoOriginal}. Informe o *preço desejado* para a venda (ex.: 50000):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe o estado de conservação (ex.: Ótimo estado, único dono).`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoPrecoVenda') {
        if (isValidAmount(textoOriginal)) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.venda) dados.venda = {};
            dados.venda.preco = textoOriginal;
            interessesClientes.set(chatId, dados);

            estadoCliente.set(chatId, { etapa: 'aguardandoFotoVenda' });
            await client.sendMessage(chatId, `Preço registrado: R$ ${textoOriginal}. Envie uma *foto* do veículo ou digite "NÃO" para pular:`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um preço válido (ex.: 50000 ou 50000.00).`);
        }
        return;
    }

    if (estado?.etapa === 'aguardandoFotoVenda') {
        if (texto === 'NÃO' || msg.hasMedia) {
            let dados = interessesClientes.get(chatId) || { interesses: [] };
            if (!dados.venda) dados.venda = {};
            if (msg.hasMedia) {
                const fotoPath = await salvarFoto(msg, chatId, 'venda');
                if (fotoPath) dados.venda.foto = fotoPath;
            }
            interessesClientes.set(chatId, dados);

            await client.sendMessage(chatId, `✅ Solicitação de venda enviada! Um consultor entrará em contato para discutir a proposta. 😊`);
            await enviarRelatorioParaContatos(chatId);
            await client.sendMessage(chatId, `📨 Relatório enviado! Obrigado pelo seu tempo. 👋 Se precisar de mais alguma coisa, é só chamar!`);

            estadoCliente.delete(chatId);
            interessesClientes.delete(chatId);
            await wait(1000);
            estadoCliente.set(chatId, { etapa: 'menuInicial' });
            await enviarMenuInicial(chatId);
        } else {
            await client.sendMessage(chatId, `Por favor, envie uma foto do veículo ou digite "NÃO" para pular.`);
        }
        return;
    }

    // Fluxo de agendamento de visita (opção 3)
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
            let lista = `Ótimo! Para simular um financiamento, me diga o *nome do carro* desejado.\n\nModelos disponíveis:\n`;
            for (const carro of carros.modelos) {
                lista += `🚘 *${carro.nome}* - ${carro.preco}\n`;
            }
            lista += `\nDigite o nome do carro ou envie "1" para ver mais detalhes dos modelos.`;
            await client.sendMessage(chatId, lista);

        } else if (texto === '3') {
            estadoCliente.set(chatId, { etapa: 'aguardandoDiaVisita' });
            await client.sendMessage(chatId, `Perfeito! Para agendar uma visita, me diga o *dia* desejado (ex.: 30/05/2025 ou "amanhã"):`);

        } else if (texto === '4') {
            await client.sendMessage(chatId, `Claro! Um de nossos consultores humanos vai falar com você em instantes. 😊\n\nEnquanto isso, se quiser agilizar, pode chamar direto:\n📞 WhatsApp: +55 46 99137-0461`);
            await wait(1000);
            estadoCliente.set(chatId, { etapa: 'menuInicial' });
            await enviarMenuInicial(chatId);

        } else if (texto === '5') {
            estadoCliente.set(chatId, { etapa: 'aguardandoModeloTroca' });
            await client.sendMessage(chatId, `Ótimo! Para avaliar seu carro na troca, me diga o *modelo* do veículo (ex.: Honda Civic):`);

        } else if (texto === '6') {
            estadoCliente.set(chatId, { etapa: 'aguardandoModeloVenda' });
            await client.sendMessage(chatId, `Perfeito! Para vender seu carro, me diga o *modelo* do veículo (ex.: Toyota Corolla):`);

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