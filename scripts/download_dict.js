import fs from 'fs';
import https from 'https';
import path from 'path';

const url = 'https://raw.githubusercontent.com/duyet/vietnamese-wordlist/master/Viet74K.txt';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    const lines = data.split('\n');
    const validWords = new Set();
    
    for (const line of lines) {
      const word = line.trim().toLowerCase();
      if (!word) continue;
      // Chỉ lấy chuỗi có chữ cái hoặc khoảng trắng (bao gồm cả tiếng việt)
      if (!/^[a-zàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ\s]+$/.test(word)) continue;
      
      const syllables = word.split(/\s+/);
      if (syllables.length === 2 && syllables[0].length > 0 && syllables[1].length > 0) {
        validWords.add(syllables.join(' '));
      }
    }
    
    const wordsArray = Array.from(validWords);
    const outPath = path.resolve('./data/vn_words.json');
    fs.writeFileSync(outPath, JSON.stringify(wordsArray, null, 0));
    console.log(`[Success] Đã lưu ${wordsArray.length} từ vào ${outPath}`);
  });
}).on('error', (err) => {
  console.log('Error: ' + err.message);
});
