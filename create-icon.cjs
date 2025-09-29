const fs = require('fs');
const { createCanvas } = require('canvas');

// Create a 1024x1024 canvas for high resolution
const canvas = createCanvas(1024, 1024);
const ctx = canvas.getContext('2d');

// Background (transparent)
ctx.clearRect(0, 0, 1024, 1024);

// Draw ninja head circle (dark gray)
ctx.fillStyle = '#2c2c2c';
ctx.beginPath();
ctx.arc(512, 512, 360, 0, Math.PI * 2);
ctx.fill();

// Draw eye band (black)
ctx.fillStyle = '#1a1a1a';
ctx.fillRect(152, 440, 720, 120);

// Draw eyes (white)
ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.ellipse(360, 500, 50, 36, 0, 0, Math.PI * 2);
ctx.fill();
ctx.beginPath();
ctx.ellipse(664, 500, 50, 36, 0, 0, Math.PI * 2);
ctx.fill();

// Draw pupils (black)
ctx.fillStyle = '#000000';
ctx.beginPath();
ctx.arc(370, 500, 24, 0, Math.PI * 2);
ctx.fill();
ctx.beginPath();
ctx.arc(674, 500, 24, 0, Math.PI * 2);
ctx.fill();

// Draw headband tails (red)
ctx.fillStyle = '#cc0000';
ctx.beginPath();
ctx.moveTo(872, 500);
ctx.lineTo(960, 460);
ctx.lineTo(970, 480);
ctx.lineTo(890, 520);
ctx.closePath();
ctx.fill();

ctx.beginPath();
ctx.moveTo(872, 500);
ctx.lineTo(960, 540);
ctx.lineTo(970, 520);
ctx.lineTo(890, 480);
ctx.closePath();
ctx.fill();

// Save as PNG
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('ninja-icon-1024.png', buffer);
console.log('Created ninja-icon-1024.png');