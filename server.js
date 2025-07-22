const express = require("express");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const ORDER_FILE = "orders.json";
const STATS_FILE = "stats.json";

// 📦 Inicializace prázdných souborů, pokud chybí
if (!fs.existsSync(ORDER_FILE)) {
  fs.writeFileSync(ORDER_FILE, "[]");
}
if (!fs.existsSync(STATS_FILE)) {
  updateStatsFile();
}

// 📊 Přepočítání statistik ze všech objednávek
function removeOrderFromStats(order) {
  if (!fs.existsSync(STATS_FILE)) return;

  const statsData = JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));

  order.items.forEach(item => {
    if (!statsData.items[item.name]) return;

    statsData.items[item.name].count -= item.count;
    statsData.items[item.name].revenue -= item.count * item.price;

    if (statsData.items[item.name].count <= 0) {
      delete statsData.items[item.name];
    }
  });

  // Odečti z celkového obratu
  statsData.totalRevenue -= order.items.reduce(
    (sum, item) => sum + item.count * item.price,
    0
  );

  if (statsData.totalRevenue < 0) statsData.totalRevenue = 0;

  fs.writeFileSync(STATS_FILE, JSON.stringify(statsData, null, 2));
}

function updateStatsFile() {
  const stats = {};
  let totalRevenue = 0;

  if (fs.existsSync(ORDER_FILE)) {
    const orders = JSON.parse(fs.readFileSync(ORDER_FILE, "utf-8"));

    orders.forEach(order => {
      order.items.forEach(item => {
        if (!stats[item.name]) {
          stats[item.name] = { count: 0, revenue: 0 };
        }
        stats[item.name].count += item.count;
        stats[item.name].revenue += item.count * item.price;
        totalRevenue += item.count * item.price;
      });
    });
  }

  fs.writeFileSync(STATS_FILE, JSON.stringify({ items: stats, totalRevenue }, null, 2));
}

function removeOrderFromStats(order) {
  if (!fs.existsSync(STATS_FILE)) return;

  const statsData = JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
  statsData.totalRevenue -= order.total || 0;

  order.items.forEach(item => {
    if (statsData.items[item.name]) {
      statsData.items[item.name].count -= item.count;
      statsData.items[item.name].revenue -= item.count * item.price;

      // Odstraň položku, pokud její počet je nula nebo méně
      if (statsData.items[item.name].count <= 0) {
        delete statsData.items[item.name];
      }
    }
  });

  fs.writeFileSync(STATS_FILE, JSON.stringify(statsData, null, 2));
}

// 📈 Přidání jedné objednávky do statistik (rychlejší než celý přepočet)
function addOrderToStats(order) {
  let statsData = { items: {}, totalRevenue: 0 };

  if (fs.existsSync(STATS_FILE)) {
    statsData = JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
  }

  statsData.totalRevenue += order.total || 0;

  order.items.forEach(item => {
    if (!statsData.items[item.name]) {
      statsData.items[item.name] = { count: 0, revenue: 0 };
    }
    statsData.items[item.name].count += item.count;
    statsData.items[item.name].revenue += item.count * item.price;
  });

  fs.writeFileSync(STATS_FILE, JSON.stringify(statsData, null, 2));
}

let clients = [];

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.push(res);
  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

function notifyClients() {
  clients.forEach(res => res.write('data: update\n\n'));
}

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(express.json());

// 📥 GET objednávky
app.get("/api/orders", (req, res) => {
  const orders = JSON.parse(fs.readFileSync(ORDER_FILE));
  res.json(orders);
});

// ➕ POST nová objednávka
app.post("/api/orders", (req, res) => {
  const orders = JSON.parse(fs.readFileSync(ORDER_FILE));
  const newOrder = { id: Date.now().toString(), ...req.body };
  orders.push(newOrder);
  fs.writeFileSync(ORDER_FILE, JSON.stringify(orders, null, 2));
  addOrderToStats(newOrder);

  io.emit("ordersUpdated");
  res.status(201).json(newOrder);
});

// ✏️ PUT úprava objednávky
app.put("/api/orders/:id", (req, res) => {
  const orders = JSON.parse(fs.readFileSync(ORDER_FILE));
  const orderIndex = orders.findIndex(order => order.id === req.params.id);

  if (orderIndex === -1) {
    return res.status(404).json({ error: "Objednávka nenalezena" });
  }

  const oldOrder = orders[orderIndex];
  const updatedOrder = { ...oldOrder, ...req.body };

  // 🧮 Odečti původní objednávku
  removeOrderFromStats(oldOrder);

  // ➕ Přičti novou objednávku
  addOrderToStats(updatedOrder);

  orders[orderIndex] = updatedOrder;
  fs.writeFileSync(ORDER_FILE, JSON.stringify(orders, null, 2));

  io.emit("ordersUpdated");
  res.json(updatedOrder);
});

// ❌ DELETE objednávky
app.delete("/api/orders/:id", (req, res) => {
  let orders = JSON.parse(fs.readFileSync(ORDER_FILE));
  const orderToDelete = orders.find(order => order.id === req.params.id);

  if (!orderToDelete) {
    return res.status(404).json({ error: "Objednávka nenalezena" });
  }

  // ⚠️ NEODEČÍTAT ze statistik – necháme statistiky být!
  orders = orders.filter(order => order.id !== req.params.id);
  fs.writeFileSync(ORDER_FILE, JSON.stringify(orders, null, 2));

  io.emit("ordersUpdated");
  res.status(204).end();
});
// 📊 GET statistiky
app.get("/api/stats", (req, res) => {
  if (!fs.existsSync(STATS_FILE)) {
    return res.status(500).json({ error: "Statistiky nejsou dostupné." });
  }
  const stats = JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
  res.json(stats);
});

// 🧹 DELETE statistiky (reset bez mazání objednávek)
app.delete("/api/stats", (req, res) => {
  fs.writeFileSync(STATS_FILE, JSON.stringify({ items: {}, totalRevenue: 0 }, null, 2));
  io.emit("ordersUpdated");
  res.status(200).json({ message: "Statistiky byly smazány." });
});

// 🔌 WebSocket připojení
io.on("connection", (socket) => {
  console.log("Nový klient připojen:", socket.id);
  socket.on("disconnect", () => {
    console.log("Klient odpojen:", socket.id);
  });
});

// 🔁 Automatické hledání volného portu
const host = '0.0.0.0';
const startPort = 3000;
const maxPort = 3100;

function startServer(port) {
  server.listen(port, host, () => {
    console.log(`Server běží na http://${host}:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} je obsazený, zkouším port ${port + 1}`);
      if (port + 1 <= maxPort) {
        startServer(port + 1);
      } else {
        console.error('Nenašel jsem volný port v rozsahu.');
        process.exit(1);
      }
    } else {
      console.error('Chyba serveru:', err);
    }
  });
}

startServer(startPort);
