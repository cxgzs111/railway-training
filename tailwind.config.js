/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        railway: { 50:'#e8f0fe',100:'#c4d6f5',200:'#9cbbec',500:'#256ad1',600:'#1a5eb0',700:'#003366',800:'#002855',900:'#001a33' },
        cr: { red:'#CC0000','red-light':'#FF4444','red-dark':'#990000' },
        steel: { 50:'#f8f9fa',100:'#e9ecef',200:'#dee2e6',300:'#ced4da',400:'#adb5bd',500:'#6c757d',600:'#495057',700:'#343a40',800:'#212529',900:'#0d1117' }
      },
      fontFamily: {
        yahei: ['"Microsoft YaHei"','微软雅黑','sans-serif']
      }
    }
  },
  plugins: []
}
