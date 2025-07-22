let cart = {};
let editingOrderId = null;

function addToCart(name, price) {
  if (cart[name]) {
    cart[name].count++;
  } else {
    cart[name] = { count: 1, price };
  }
  renderCart();
}

function removeFromCart(name) {
  if (cart[name]) {
    cart[name].count--;
    if (cart[name].count <= 0) {
      delete cart[name];
    }
  }
  renderCart();
}

function renderCart() {
  const cartElement = document.getElementById("cart");
  cartElement.innerHTML = "";

  const total = Object.keys(cart).reduce((sum, name) => {
    return sum + cart[name].count * cart[name].price;
  }, 0);

  for (const name in cart) {
    const item = cart[name];
    const li = document.createElement("li");
    li.innerHTML = `
      ${name} x ${item.count} (${item.price} Kč) 
      <button onclick="addToCart('${name}', ${item.price})">+</button>
      <button onclick="removeFromCart('${name}')">−</button>
    `;
    cartElement.appendChild(li);
  }

  document.getElementById("total").textContent = total + " Kč";
}

function showNotification(message, duration = 2000) {
  const notification = document.getElementById("notification");
  notification.textContent = message;
  notification.style.display = "block";
  setTimeout(() => {
    notification.style.display = "none";
  }, duration);
}

async function saveOrder() {
  const items = Object.keys(cart).map(name => ({
    name,
    count: cart[name].count,
    price: cart[name].price
  }));
  const total = items.reduce((sum, i) => sum + i.count * i.price, 0);

  const method = editingOrderId ? "PUT" : "POST";
  const url = editingOrderId ? `/api/orders/${editingOrderId}` : "/api/orders";

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ items, total })
  });

  if (res.ok) {
    showNotification(editingOrderId ? "Objednávka upravena" : "Objednávka uložena");
    cart = {};
    editingOrderId = null;
    updateEditMode(false);
    renderCart();
    loadOrders();
  } else {
    showNotification("Chyba při ukládání", 4000);
  }
}

async function deleteOrder(id) {
  const res = await fetch(`/api/orders/${id}`, {
    method: "DELETE"
  });
  if (res.ok) {
    showNotification("Objednávka smazána");
    loadOrders();
  } else {
    showNotification("Chyba při mazání", 4000);
  }
}

function editOrder(order) {
  cart = {};
  order.items.forEach(item => {
    cart[item.name] = { count: item.count, price: item.price };
  });
  editingOrderId = order.id;
  renderCart();
  updateEditMode(true);
}

function updateEditMode(enabled) {
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.textContent = enabled ? "Uložit změny" : "Odeslat objednávku";
}

function renderOrders(orders) {
  const table = document.getElementById("ordersTable");
  table.innerHTML = `
    <tr>
      <th>Čas</th>
      <th>Položky</th>
      <th>Celkem</th>
      <th>Akce</th>
    </tr>
  `;

  orders
    .sort((a, b) => b.id - a.id)
    .forEach(order => {
      const row = document.createElement("tr");

      const time = new Date(Number(order.id)).toLocaleTimeString();
      const itemsText = order.items.map(i => `${i.name} x${i.count}`).join(", ");
      const total = order.total + " Kč";

      row.innerHTML = `
        <td>${time}</td>
        <td>${itemsText}</td>
        <td>${total}</td>
        <td>
          <button onclick='editOrder(${JSON.stringify(order)})'>Upravit</button>
          <button onclick='deleteOrder("${order.id}")'>Smazat</button>
        </td>
      `;

      table.appendChild(row);
    });
}

async function loadOrders() {
  const res = await fetch("/api/orders");
  const orders = await res.json();
  renderOrders(orders);
}

document.addEventListener("DOMContentLoaded", () => {
  loadOrders();
});
