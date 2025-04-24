const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const uuid = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Estructura de dades
const channels = new Map(); // Map<channelId, channelData>
const users = new Map();    // Map<userId, userData>

// Canal per defecte
const defaultChannelId = 'general';
channels.set(defaultChannelId, {
  id: defaultChannelId,
  name: 'General',
  createdBy: 'system',
  admins: new Set(['system']),
  messages: [],
  users: new Set()
});

app.use(express.static('public'));

wss.on('connection', (ws) => {
  ws.id = uuid.v4();
  ws.channels = new Set([defaultChannelId]);  // Añadir al canal general por defecto
  
  console.log(`Nova connexió: ${ws.id}`);
  
  // Enviar estado inicial completo
  ws.send(JSON.stringify({
    type: 'initial_state',
    currentChannel: defaultChannelId,
    channels: Array.from(channels.values()).map(ch => ({
      id: ch.id,
      name: ch.name,
      userCount: ch.users.size
    }))
  }));
  
  // Unir al canal general automáticamente
  joinChannel(ws, defaultChannelId);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, data);
    } catch (err) {
      console.error('Error al processar missatge:', err);
    }
  });
  
  ws.on('close', () => {
    console.log(`Connexió tancada: ${ws.id}`);
    // Eliminar usuari de tots els canals
    ws.channels.forEach(channelId => {
      leaveChannel(ws, channelId);
    });
    users.delete(ws.id);
  });
});

function handleMessage(ws, data) {
  switch (data.type) {
    case 'set_username':
      setUsername(ws, data.username);
      break;
    case 'message':
      handleChatMessage(ws, data);
      break;
    case 'create_channel':
      createChannel(ws, data.channelName);
      break;
    case 'join_channel':
      joinChannel(ws, data.channelId);
      break;
    case 'leave_channel':
      leaveChannel(ws, data.channelId);
      break;
    case 'add_admin':
      addAdmin(ws, data.channelId, data.userId);
      break;
    case 'remove_admin':
      removeAdmin(ws, data.channelId, data.userId);
      break;
    case 'delete_message':
      deleteMessage(ws, data.channelId, data.messageId);
      break;
    case 'get_history':
      sendChannelHistory(ws, data.channelId);
      break;
    // Funcionalitat innovadora: missatges privats
    case 'private_message':
      sendPrivateMessage(ws, data.toUserId, data.message);
      break;
  }
}

function setUsername(ws, username) {
  if (!username || username.trim() === '') return;
  
  // Comprovar si el nom d'usuari ja està en ús
  for (const [id, user] of users) {
    if (user.username === username && id !== ws.id) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Aquest nom d\'usuari ja està en ús'
      }));
      return;
    }
  }
  
  users.set(ws.id, {
    id: ws.id,
    username: username,
    isAdmin: false
  });
  
  // Notificar a tots els canals on està connectat
  ws.channels.forEach(channelId => {
    broadcastToChannel(channelId, {
      type: 'user_joined',
      userId: ws.id,
      username: username
    });
  });
  
  ws.send(JSON.stringify({
    type: 'username_set',
    username: username
  }));
}

function handleChatMessage(ws, data) {
  const user = users.get(ws.id);
  if (!user || !user.username) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Primer has de configurar el teu nom d\'usuari'
    }));
    return;
  }
  
  /*
  if (!ws.channels.has(data.channelId)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'No ets membre d\'aquest canal'
    }));
    return;
  }
  */
  const channel = channels.get(data.channelId);
  if (!channel) return;
  
  const message = {
    id: uuid.v4(),
    userId: ws.id,
    username: user.username,
    text: data.text,
    timestamp: new Date().toISOString(),
    channelId: data.channelId
  };
  
  channel.messages.push(message);
  
  // Enviar missatge a tots els membres del canal
  broadcastToChannel(data.channelId, {
    type: 'message',
    ...message
  });
}

function createChannel(ws, channelName) {
  const user = users.get(ws.id);
  if (!user || !user.username) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Primer has de configurar el teu nom d\'usuari'
    }));
    return;
  }
  
  if (!channelName || channelName.trim() === '') {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'El nom del canal no pot estar buit'
    }));
    return;
  }
  
  const channelId = uuid.v4();
  const newChannel = {
    id: channelId,
    name: channelName,
    createdBy: ws.id,
    admins: new Set([ws.id]),
    messages: [],
    users: new Set()
  };
  
  channels.set(channelId, newChannel);
  
  // Notificar a tots els usuaris
  broadcastToAll({
    type: 'channel_created',
    channel: {
      id: channelId,
      name: channelName,
      userCount: 0
    }
  });
  
  // Unir automàticament el creador al nou canal
  joinChannel(ws, channelId);
}

function joinChannel(ws, channelId) {
  const channel = channels.get(channelId);
  if (!channel) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Canal no trobat'
    }));
    return;
  }

    // Si ya está en el canal, solo notificar al cliente
    if (ws.channels.has(channelId)) {
      ws.send(JSON.stringify({
        type: 'channel_joined',
        channelId: channelId,
        channelName: channel.name
      }));
      return;
    }
  
  
  const user = users.get(ws.id);
  if (!user || !user.username) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Primer has de configurar el teu nom d\'usuari'
    }));
    return;
  }
  
  channel.users.add(ws.id);
  ws.channels.add(channelId);
  
  // Enviar històric del canal al nou usuari
  sendChannelHistory(ws, channelId);
  
  // Notificar als altres membres del canal
  broadcastToChannel(channelId, {
    type: 'user_joined',
    userId: ws.id,
    username: user.username
  }, ws);

    // Notificar al cliente que se ha unido al canal
    ws.send(JSON.stringify({
      type: 'channel_joined',
      channelId: channelId,
      channelName: channel.name
    }));
  
  // Actualitzar llista de canals per a tothom
  broadcastChannelListUpdate();
}

function leaveChannel(ws, channelId) {
  const channel = channels.get(channelId);
  if (!channel) return;
  
  channel.users.delete(ws.id);
  ws.channels.delete(channelId);
  
  const user = users.get(ws.id);
  if (!user) return;
  
  // Notificar als altres membres del canal
  broadcastToChannel(channelId, {
    type: 'user_left',
    userId: ws.id,
    username: user.username
  });
  
  // Si el canal queda buit i no és el general, eliminar-lo
  if (channelId !== defaultChannelId && channel.users.size === 0) {
    channels.delete(channelId);
    broadcastChannelListUpdate();
  }
}

function addAdmin(ws, channelId, userId) {
  const channel = channels.get(channelId);
  if (!channel) return;
  
  // Comprovar que el sol·licitant és admin
  if (!channel.admins.has(ws.id)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'No tens permisos per fer això'
    }));
    return;
  }
  
  channel.admins.add(userId);
  
  broadcastToChannel(channelId, {
    type: 'admin_added',
    userId: userId,
    byUserId: ws.id
  });
}

function removeAdmin(ws, channelId, userId) {
  const channel = channels.get(channelId);
  if (!channel) return;
  
  // Comprovar que el sol·licitant és admin
  if (!channel.admins.has(ws.id)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'No tens permisos per fer això'
    }));
    return;
  }
  
  // No permetre eliminar-se a si mateix com a admin
  if (userId === ws.id && channel.admins.size === 1) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'No pots eliminar-te com a únic administrador'
    }));
    return;
  }
  
  channel.admins.delete(userId);
  
  broadcastToChannel(channelId, {
    type: 'admin_removed',
    userId: userId,
    byUserId: ws.id
  });
}

function deleteMessage(ws, channelId, messageId) {
  const channel = channels.get(channelId);
  if (!channel) return;
  
  // Comprovar que el sol·licitant és admin
  if (!channel.admins.has(ws.id)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'No tens permisos per fer això'
    }));
    return;
  }
  
  const messageIndex = channel.messages.findIndex(m => m.id === messageId);
  if (messageIndex === -1) return;
  
  channel.messages.splice(messageIndex, 1);
  
  broadcastToChannel(channelId, {
    type: 'message_deleted',
    messageId: messageId,
    byUserId: ws.id
  });
}

function sendChannelHistory(ws, channelId) {
  const channel = channels.get(channelId);
  if (!channel) return;
  
  ws.send(JSON.stringify({
    type: 'channel_history',
    channelId: channelId,
    messages: channel.messages,
    users: Array.from(channel.users).map(id => ({
      id: id,
      username: users.get(id)?.username || 'Desconegut'
    })),
    admins: Array.from(channel.admins)
  }));
}

// Funcionalitat innovadora: missatges privats
function sendPrivateMessage(ws, toUserId, messageText) {
  const fromUser = users.get(ws.id);
  const toUser = users.get(toUserId);
  
  if (!fromUser || !fromUser.username) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Primer has de configurar el teu nom d\'usuari'
    }));
    return;
  }
  
  if (!toUser) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Usuari destinatari no trobat'
    }));
    return;
  }
  
  // Trobar la connexió WebSocket de l'usuari destinatari
  let toWs = null;
  wss.clients.forEach(client => {
    if (client.id === toUserId) {
      toWs = client;
    }
  });
  
  if (!toWs) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'L\'usuari destinatari no està connectat'
    }));
    return;
  }
  
  const privateMessage = {
    id: uuid.v4(),
    type: 'private_message',
    fromUserId: ws.id,
    fromUsername: fromUser.username,
    toUserId: toUserId,
    text: messageText,
    timestamp: new Date().toISOString()
  };
  
  // Enviar missatge a l'emissor i al receptor
  ws.send(JSON.stringify(privateMessage));
  toWs.send(JSON.stringify(privateMessage));
}

// Funcions d'ajuda
function broadcastToChannel(channelId, message, excludeWs = null) {
  const channel = channels.get(channelId);
  if (!channel) return;
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && 
        client.channels && client.channels.has(channelId)) {
      if (!excludeWs || client.id !== excludeWs.id) {
        client.send(JSON.stringify(message));
      }
    }
  });
}

function broadcastToAll(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function broadcastChannelListUpdate() {
  const channelsList = Array.from(channels.values()).map(ch => ({
    id: ch.id,
    name: ch.name,
    userCount: ch.users.size
  }));
  
  broadcastToAll({
    type: 'channels_list',
    channels: channelsList
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor escoltant al port ${PORT}`);
});