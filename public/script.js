document.addEventListener("DOMContentLoaded", () => {
    const usernameInput = document.getElementById("username-input")
    const setUsernameBtn = document.getElementById("set-username-btn")
    const currentUsernameDisplay = document.getElementById("current-username")
    const newChannelInput = document.getElementById("new-channel-input")
    const createChannelBtn = document.getElementById("create-channel-btn")
    const channelsList = document.getElementById("channels-list")
    const usersList = document.getElementById("users-list")
    const currentChannelName = document.getElementById("current-channel-name")
    const leaveChannelBtn = document.getElementById("leave-channel-btn")
    const messagesContainer = document.getElementById("messages")
    const messageInput = document.getElementById("message-input")
    const sendMessageBtn = document.getElementById("send-message-btn")
    const messagesScrollContainer = document.getElementById("messages-container")
    const toggleSidebarBtn = document.querySelector(".toggle-sidebar-btn")
    const toggleSidebar = document.querySelector(".toggle-sidebar")
    const sidebarCol = document.querySelector(".sidebar-col")
  
    let currentUser = null
    let currentChannelId = "general"
    let socket = null
    let typingTimeout = null
    let isTyping = false
  

// Añade esto al inicio con las otras variables
let greetingCooldown = false;

// Función para obtener saludo aleatorio
// Reemplaza la función existente getRandomGreeting con esta versión simplificada
function getRandomGreeting() {
  if (!currentUser) {
      showToast("Primero establece tu nombre de usuario", "error");
      return;
  }

  // Array de mensajes aleatorios
  const randomGreetings = [
      "¡Hola a todos! ¿Cómo están hoy?",
      "¡Hey! ¡Qué tal el día!",
      "¡Saludos cordiales para todos!"
  ];

  // Seleccionar un mensaje aleatorio
  const randomMessage = randomGreetings[Math.floor(Math.random() * randomGreetings.length)];

  // Enviar el mensaje al chat
  socket.send(JSON.stringify({
      type: "message",
      channelId: currentChannelId,
      text: randomMessage
  }));

  // Pequeña animación para el botón
  const btn = document.getElementById("random-greeting-btn");
  btn.classList.add("clicked");
  setTimeout(() => {
      btn.classList.remove("clicked");
  }, 300);
}

// Añade este event listener con los otros
document.getElementById("random-greeting-btn").addEventListener("click", getRandomGreeting);

    // Toggle sidebar on mobile
    toggleSidebarBtn.addEventListener("click", () => {
      sidebarCol.classList.add("show")
    })
  
    toggleSidebar.addEventListener("click", () => {
      sidebarCol.classList.remove("show")
    })
  
    // Close sidebar when clicking outside on mobile
    document.addEventListener("click", (e) => {
      if (window.innerWidth < 768) {
        if (!sidebarCol.contains(e.target) && !toggleSidebarBtn.contains(e.target)) {
          sidebarCol.classList.remove("show")
        }
      }
    })
  
    // Connexió WebSocket
    function connectWebSocket() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const host = window.location.host
      socket = new WebSocket(`${protocol}//${host}`)
  
      socket.onopen = () => {
        console.log("Connexió WebSocket establerta")
        showToast("Connexió establerta", "success")
      }
  
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data)
        handleSocketMessage(data)
      }
  
      socket.onclose = () => {
        console.log("Connexió WebSocket tancada")
        showToast("Connexió perduda. Intentant reconnectar...", "warning")
        // Intentar reconnectar després de 5 segons
        setTimeout(connectWebSocket, 5000)
      }
  
      socket.onerror = (error) => {
        console.error("Error en WebSocket:", error)
        showToast("Error de connexió", "error")
      }
    }
  
    // Gestió de missatges del servidor
    function handleSocketMessage(data) {
      switch (data.type) {
        case "username_set":
          currentUser = { id: data.username }
          currentUsernameDisplay.textContent = `Hola, ${data.username}!`
          currentUsernameDisplay.classList.add("fade-in")
          usernameInput.disabled = true
          setUsernameBtn.disabled = true
          messageInput.disabled = false
          sendMessageBtn.disabled = false
  
          // Animació per al botó d'establir nom
          setUsernameBtn.classList.remove("pulse-btn")
  
          showToast(`Benvingut, ${data.username}!`, "success")
          break
  
        case "error":
          showToast(data.message, "error")
          break
  
        case "channels_list":
          updateChannelsList(data.channels)
          break
  
        case "channel_created":
          addChannelToList(data.channel)
          showToast(`Canal ${data.channel.name} creat!`, "success")
          break
  
        case "channel_history":
          if (data.channelId === currentChannelId) {
            messagesContainer.innerHTML = ""
  
            // Afegir animació de càrrega
            const loadingDiv = document.createElement("div")
            loadingDiv.className = "message system-message"
            loadingDiv.innerHTML = "Carregant missatges..."
            messagesContainer.appendChild(loadingDiv)
  
            setTimeout(() => {
              messagesContainer.innerHTML = ""
              data.messages.forEach((message, index) => {
                // Afegir retard per a l'animació
                setTimeout(() => {
                  addMessageToChat(message)
                  scrollToBottom()
                }, index * 100)
              })
  
              // Actualitzar llista d'usuaris
              updateUsersList(data.users, data.admins)
            }, 500)
          }
          break
  
        case "message":
          if (data.channelId === currentChannelId) {
            // Eliminar indicador d'escriptura si existeix
            removeTypingIndicator()
  
            addMessageToChat(data)
            scrollToBottom()
  
            // Afegir efecte de so per a nous missatges
            playMessageSound(data.userId === currentUser?.id)
          }
          break
  
        case "message_deleted":
          const messageToDelete = document.querySelector(`.message[data-message-id="${data.messageId}"]`)
          if (messageToDelete) {
            // Animació de desaparició
            messageToDelete.style.opacity = "0"
            messageToDelete.style.transform = "scale(0.8)"
  
            setTimeout(() => {
              messageToDelete.innerHTML = `
                              <div class="message-header">
                                  <span>Missatge eliminat per l'administrador</span>
                              </div>
                          `
              messageToDelete.classList.add("system-message")
              messageToDelete.style.opacity = "1"
              messageToDelete.style.transform = "scale(1)"
            }, 300)
          }
          break
  
        case "user_joined":
          if (data.channelId === currentChannelId || data.channelId === undefined) {
            addSystemMessage(`${data.username} s'ha unit al xat`)
            addUserToList(data.userId, data.username, false)
  
            // Animació de benvinguda
            showToast(`${data.username} s'ha unit al xat!`, "info")
          }
          break
  
        case "user_left":
          if (data.channelId === currentChannelId || data.channelId === undefined) {
            addSystemMessage(`${data.username} ha abandonat el xat`)
            removeUserFromList(data.userId)
          }
          break
  
        case "admin_added":
          if (data.userId === currentUser?.id) {
            addSystemMessage("Ara ets administrador d'aquest canal")
            showToast("Ara ets administrador!", "success")
          }
          updateUserAdminStatus(data.userId, true)
          break
  
        case "admin_removed":
          if (data.userId === currentUser?.id) {
            addSystemMessage("Ja no ets administrador d'aquest canal")
          }
          updateUserAdminStatus(data.userId, false)
          break
  
        case "private_message":
          handlePrivateMessage(data)
          break
  
        case "user_typing":
          if (data.channelId === currentChannelId && data.userId !== currentUser?.id) {
            showTypingIndicator(data.username)
          }
          break
      }
    }
  
    // Mostrar indicador d'escriptura
    function showTypingIndicator(username) {
      removeTypingIndicator() // Eliminar l'anterior si existeix
  
      const typingDiv = document.createElement("div")
      typingDiv.className = "typing-indicator"
      typingDiv.id = "typing-indicator"
      typingDiv.innerHTML = `
              <small>${username} està escrivint...</small>
              <span></span>
              <span></span>
              <span></span>
          `
  
      messagesContainer.appendChild(typingDiv)
      scrollToBottom()
  
      // Eliminar després de 3 segons si no hi ha actualització
      setTimeout(removeTypingIndicator, 3000)
    }
  
    function removeTypingIndicator() {
      const typingIndicator = document.getElementById("typing-indicator")
      if (typingIndicator) {
        typingIndicator.remove()
      }
    }
  
    // Reproduir so de missatge
    function playMessageSound(isOwnMessage) {
      // Aquí es podria implementar un so diferent per a missatges propis i d'altres
      const audio = new Audio(
        isOwnMessage
          ? "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3"
          : "https://assets.mixkit.co/active_storage/sfx/1862/1862-preview.mp3",
      )
      audio.volume = 0.2
      audio.play().catch((e) => console.log("Error reproduint so:", e))
    }
  
    // Mostrar notificació toast
    function showToast(message, type = "info") {
      // Eliminar toast anterior si existeix
      const existingToast = document.querySelector(".toast")
      if (existingToast) {
        existingToast.remove()
      }
  
      const toast = document.createElement("div")
      toast.className = `toast ${type}`
  
      let icon = ""
      switch (type) {
        case "success":
          icon = '<i class="fas fa-check-circle"></i>'
          break
        case "error":
          icon = '<i class="fas fa-exclamation-circle"></i>'
          break
        case "warning":
          icon = '<i class="fas fa-exclamation-triangle"></i>'
          break
        default:
          icon = '<i class="fas fa-info-circle"></i>'
      }
  
      toast.innerHTML = `${icon} ${message}`
      document.body.appendChild(toast)
  
      // Eliminar després de 5 segons
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove()
        }
      }, 5000)
    }
  
    // Establir nom d'usuari
    setUsernameBtn.addEventListener("click", () => {
      const username = usernameInput.value.trim()
      if (username) {
        socket.send(
          JSON.stringify({
            type: "set_username",
            username: username,
          }),
        )
      } else {
        showToast("Si us plau, introdueix un nom d'usuari", "warning")
      }
    })
  
    usernameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        setUsernameBtn.click()
      }
    })
  
    // Crear nou canal
    createChannelBtn.addEventListener("click", () => {
      const channelName = newChannelInput.value.trim()
      if (channelName) {
        socket.send(
          JSON.stringify({
            type: "create_channel",
            channelName: channelName,
          }),
        )
        newChannelInput.value = ""
  
        // Animació del botó
        createChannelBtn.classList.add("clicked")
        setTimeout(() => {
          createChannelBtn.classList.remove("clicked")
        }, 300)
      } else {
        showToast("Si us plau, introdueix un nom per al canal", "warning")
      }
    })
  
    newChannelInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        createChannelBtn.click()
      }
    })
  
    // Canviar de canal
    function selectChannel(channelId, channelName) {
      // Animació de transició
      messagesContainer.style.opacity = "0"
      messagesContainer.style.transform = "translateY(20px)"
  
      setTimeout(() => {
        currentChannelId = channelId
        currentChannelName.textContent = channelName
  
        // Actualitzar l'estat visual del canal seleccionat
        document.querySelectorAll("#channels-list li").forEach((li) => {
          li.classList.remove("active")
          if (li.dataset.channelId === channelId) {
            li.classList.add("active")
          }
        })
  
        // Activar/desactivar botó d'abandonar canal
        leaveChannelBtn.disabled = channelId === "general"
  
        // Sol·licitar històric del canal
        socket.send(
          JSON.stringify({
            type: "get_history",
            channelId: channelId,
          }),
        )
  
        // Restaurar animació
        messagesContainer.style.opacity = "1"
        messagesContainer.style.transform = "translateY(0)"
  
        // Tancar sidebar en mòbil després de seleccionar canal
        if (window.innerWidth < 768) {
          sidebarCol.classList.remove("show")
        }
      }, 300)
    }
  
    // Abandonar canal
    leaveChannelBtn.addEventListener("click", () => {
      if (currentChannelId !== "general") {
        socket.send(
          JSON.stringify({
            type: "leave_channel",
            channelId: currentChannelId,
          }),
        )
  
        // Animació de sortida
        showToast(`Has abandonat el canal ${currentChannelName.textContent}`, "info")
  
        // Tornar al canal general
        selectChannel("general", "General")
      }
    })
  
    // Enviar missatge
    sendMessageBtn.addEventListener("click", () => {
      sendMessage()
    })
  
    messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        sendMessage()
      }
  
      // Enviar estat d'escriptura
      if (!isTyping && currentUser) {
        isTyping = true
        socket.send(
          JSON.stringify({
            type: "user_typing",
            channelId: currentChannelId,
          }),
        )
  
        // Restablir l'estat després de 2 segons
        clearTimeout(typingTimeout)
        typingTimeout = setTimeout(() => {
          isTyping = false
        }, 2000)
      }
    })
  
    function sendMessage() {
      const messageText = messageInput.value.trim()
      if (messageText && currentUser) {
        // Animació del botó d'enviar
        sendMessageBtn.classList.add("clicked")
        setTimeout(() => {
          sendMessageBtn.classList.remove("clicked")
        }, 300)
  
        socket.send(
          JSON.stringify({
            type: "message",
            channelId: currentChannelId,
            text: messageText,
          }),
        )
        messageInput.value = ""
  
        // Si rebem error de "no ets membre", re-unir-se al canal
        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: "join_channel",
              channelId: currentChannelId,
            }),
          )
        }, 100)
  
        // Restablir l'estat d'escriptura
        isTyping = false
        clearTimeout(typingTimeout)
      }
    }
  
    // Actualitzar llista de canals
    function updateChannelsList(channels) {
      channelsList.innerHTML = ""
      channels.forEach((channel, index) => {
        // Afegir retard per a l'animació
        setTimeout(() => {
          addChannelToList(channel)
        }, index * 100)
      })
    }
  
    function addChannelToList(channel) {
      const li = document.createElement("li")
      li.dataset.channelId = channel.id
      li.innerHTML = `
              ${channel.name} <span class="user-count">${channel.userCount}</span>
          `
  
      li.addEventListener("click", () => {
        selectChannel(channel.id, channel.name)
      })
  
      if (channel.id === currentChannelId) {
        li.classList.add("active")
      }
  
      // Animació d'entrada
      li.style.opacity = "0"
      li.style.transform = "translateX(-10px)"
  
      channelsList.appendChild(li)
  
      // Activar animació
      setTimeout(() => {
        li.style.opacity = "1"
        li.style.transform = "translateX(0)"
      }, 50)
    }
  
    // Actualitzar llista d'usuaris
    function updateUsersList(users, admins = []) {
      usersList.innerHTML = ""
      users.forEach((user, index) => {
        const isAdmin = admins.includes(user.id)
        // Afegir retard per a l'animació
        setTimeout(() => {
          addUserToList(user.id, user.username, isAdmin)
        }, index * 100)
      })
    }
  
    function addUserToList(userId, username, isAdmin) {
      // Comprovar si l'usuari ja està a la llista
      if (document.querySelector(`#users-list li[data-user-id="${userId}"]`)) {
        updateUserAdminStatus(userId, isAdmin)
        return
      }
  
      const li = document.createElement("li")
      li.dataset.userId = userId
      li.textContent = username
  
      if (isAdmin) {
        li.classList.add("admin")
      }
  
      // Funcionalitat innovadora: enviar missatge privat
      if (userId !== currentUser?.id) {
        li.style.cursor = "pointer"
        li.title = "Enviar missatge privat"
  
        li.addEventListener("click", () => {
          const message = prompt(`Missatge privat a ${username}:`)
          if (message) {
            socket.send(
              JSON.stringify({
                type: "private_message",
                toUserId: userId,
                message: message,
              }),
            )
          }
        })
      }
  
      // Animació d'entrada
      li.style.opacity = "0"
      li.style.transform = "translateX(-10px)"
  
      usersList.appendChild(li)
  
      // Activar animació
      setTimeout(() => {
        li.style.opacity = "1"
        li.style.transform = "translateX(0)"
      }, 50)
    }
  
    function removeUserFromList(userId) {
      const userLi = document.querySelector(`#users-list li[data-user-id="${userId}"]`)
      if (userLi) {
        // Animació de sortida
        userLi.style.opacity = "0"
        userLi.style.transform = "translateX(-10px)"
  
        setTimeout(() => {
          userLi.remove()
        }, 300)
      }
    }
  
    function updateUserAdminStatus(userId, isAdmin) {
      const userLi = document.querySelector(`#users-list li[data-user-id="${userId}"]`)
      if (userLi) {
        if (isAdmin) {
          userLi.classList.add("admin")
        } else {
          userLi.classList.remove("admin")
        }
      }
    }
  
    function addMessageToChat(message) {
      const messageDiv = document.createElement("div");
      messageDiv.classList.add("message");
      messageDiv.dataset.messageId = message.id;
  
      const isCurrentUser = message.userId === currentUser?.id;
      const isAdmin = isAdminInCurrentChannel();
  
      // Clases según tipo de mensaje
      messageDiv.classList.add(isCurrentUser ? "user-message" : "other-message");
  
      const timestamp = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
      // Contenido del mensaje
      let messageContent = `
          <div class="message-header">
              <span class="username">${message.username}</span>
              <span class="timestamp">${timestamp}</span>
          </div>
          <div class="message-text">${message.text}</div>
      `;
  
      // Solo mostrar botón si es admin o mensaje propio
      if (isAdmin || isCurrentUser) {
          messageContent += `
              <div class="message-actions">
                  <button class="delete-message-btn" data-message-id="${message.id}">
                      <i class="fas fa-trash"></i> Eliminar
                  </button>
              </div>
          `;
      }
  
      messageDiv.innerHTML = messageContent;
      messagesContainer.appendChild(messageDiv);
  
      // Añadir evento de borrado
      const deleteBtn = messageDiv.querySelector(".delete-message-btn");
      if (deleteBtn) {
          deleteBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (confirm("¿Eliminar este mensaje?")) {
                  socket.send(JSON.stringify({
                      type: "delete_message",
                      channelId: currentChannelId,
                      messageId: message.id
                  }));
              }
          });
      }
  }
  
    function addSystemMessage(text) {
      const messageDiv = document.createElement("div")
      messageDiv.classList.add("message", "system-message")
      messageDiv.innerHTML = `
              <div class="message-text">${text}</div>
          `
      messagesContainer.appendChild(messageDiv)
      scrollToBottom()
    }
  
    function handlePrivateMessage(data) {
      const isCurrentUser = data.fromUserId === currentUser?.id
      const otherUsername = isCurrentUser ? data.toUsername : data.fromUsername
  
      const messageDiv = document.createElement("div")
      messageDiv.classList.add("message", "private-message")
      messageDiv.innerHTML = `
              <div class="message-header">
                  <span class="username">Missatge privat ${isCurrentUser ? "a" : "de"} ${otherUsername}</span>
                  <span class="timestamp">${new Date(data.timestamp).toLocaleTimeString()}</span>
              </div>
              <div class="message-text">${data.text}</div>
          `
  
      messagesContainer.appendChild(messageDiv)
      scrollToBottom()
  
      // Notificació especial per a missatges privats
      if (!isCurrentUser) {
        showToast(`Missatge privat de ${data.fromUsername}`, "info")
        playMessageSound(false)
      }
    }
  
    // Comprovar si l'usuari actual és administrador del canal actual
    function isAdminInCurrentChannel() {
        if (!currentUser) return false;
        const userElement = document.querySelector(`#users-list li[data-user-id="${currentUser.id}"]`);
        return userElement ? userElement.classList.contains('admin') : false;
    }
  
    // Desplaçar-se al final dels missatges
    function scrollToBottom() {
      messagesScrollContainer.scrollTop = messagesScrollContainer.scrollHeight
    }
  
    // Gestionar canvis de mida de la finestra
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 768) {
        sidebarCol.classList.remove("show")
      }
    })
  
    // Iniciar la connexió WebSocket
    connectWebSocket()
  
    // Seleccionar el canal general per defecte
    selectChannel("general", "General")
  
    // Afegir animació al botó d'establir nom d'usuari
    setUsernameBtn.classList.add("pulse-btn")
  })
  