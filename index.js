const express = require('express');
const app = express();
const serv = require('http').Server(app);
const Filter = require('bad-words');
const filter = new Filter();

app.use('/', express.static(__dirname + '/client/'));

serv.listen(1276);
console.log('Server started.');

const io = require('socket.io')(serv);

const fs = require('fs');

const map = JSON.parse(fs.readFileSync("map.json"));


const { Floor, Player, Bullet } = require('./classes.js');

const players = {};

const floors = [];



for (const f of map.data) floors.push(new Floor(f[0], f[1], f[2], f[3], f[4], f[5], f[6]));

io.on('connection', socket => {
	const id = socket.id;
	players[id] = new Player(Math.floor((Math.random() * 250) - 124), Math.floor((Math.random() * 250) - 124), 500, 1);
	const p = players[id];
	socket.emit('id', socket.id);
	socket.emit('floors', floors);
	socket.on('move', data => {
		const x = Math.sin(data.angle) * data.speed;
		const y = Math.cos(data.angle) * data.speed;
		if (p.landed && data.jump) {
			p.sz += 0.5;
			p.landed = false;	
		}

		p.sx = x;
		p.sy = y;
	});

	socket.on('angle', a => {
		p.angle = a;
	});

	socket.on('shoot', a => {
    if (!p.ready) return;
		const b = new Bullet(p.x, p.y, p.z);
		p.bullets.push(b);

		b.sx = Math.sin(a.z) * Math.sin(a.x);
		b.sy = Math.cos(a.z) * Math.sin(a.x);
		b.sz = 0 - Math.cos(a.x);
    p.ready = false;
    setTimeout(() => p.ready = true, 50);
	});

	socket.on('disconnect', () => {
		delete players[id];
	});
	socket.on("m", function(mes) {
    socket.broadcast.emit("cm", filter.clean(mes));
    socket.emit("cm", filter.clean(mes));
  });
});

function update() {
	for (const i in players) {
		const p = players[i];

		p.x += p.sx / 5;
		p.y += p.sy / 5;
		p.z += p.sz / 3;

		if (p.z < -50) {
		  p.reSpawn();
		  io.emit("oof", p);
		}
		let landed = false;
		for (const f of floors) {
			if (f.collide(p)) {
				landed = true;
				break;
			}
		}
		p.landed = landed;
		if (!p.landed) p.sz -= 0.006;
		else p.sz = 0;

		for (const i in p.bullets) {
			const b = p.bullets[i];
			b.x += b.sx;
			b.y += b.sy;
      b.z += b.sz;

			if (b.x < -250 || b.x > 250 || b.y < -250 || b.y > 250 || b.z < -250 || b.z > 250)
				p.bullets.splice(i, 1);
      
      for (const i in players) {
        const target = players[i];
        if(p != target && b.collide(target)) {
          target.hp -= 20;
          p.bullets.splice(p.bullets.indexOf(b), 1);
          
          if(target.hp <= 0) {
            target.reSpawn();
            io.emit("oof", target);
            p.score++;
          }
          break;
        }
      }
		}
	}
}


function send(){
  const pack = [];
	for (const i in players) {
		const p = players[i];
		const bullets = [];
		for (const b of p.bullets) bullets.push({ x: b.x, y: b.y, z: b.z, id: b.id });

		pack.push({
			x: p.x,
			y: p.y,
			z: p.z,
			id: i,
      hp: p.hp,
			angle: p.angle,
			bullets: bullets,
			score: p.score
		});
	}

	io.emit('players', pack);
}

setInterval(() => {
	update();
	send();
}, 1000 / 300);