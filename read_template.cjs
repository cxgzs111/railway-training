const fs = require('fs');
const AdmZip = require('adm-zip');
const zip = new AdmZip('D:\\1指导书期间文件\\两违\\张宇个人定向培训建议.docx');
const xml = zip.readAsText('word/document.xml');
// Save raw XML for analysis
fs.writeFileSync('d:\\true1\\template_doc.xml', xml, 'utf8');
// Extract text content between w:t tags
const texts = [];
const regex = new RegExp('<w:t[^>]*>([^<]*)<\\/w:t>', 'g');
let m;
while ((m = regex.exec(xml)) !== null) {
  texts.push(m[1]);
}
// Also find paragraph breaks
const fullText = xml.replace(/<\/w:p>/g, '\n').replace(/<w:t[^>]*>/g, '').replace(/<[^>]+>/g, '');
console.log('=== TEMPLATE TEXT ===');
console.log(fullText.trim());
