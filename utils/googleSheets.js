import { GoogleSpreadsheet } from 'google-spreadsheet'
import { JWT } from 'google-auth-library'
import dotenv from 'dotenv'

dotenv.config()

let auth = null
if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
  auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })
}

export async function initSheet(sheetId) {
  if (!auth) {
    console.warn('⚠️ Google Sheets Auth bị thiếu. Hãy điền GOOGLE_SERVICE_ACCOUNT_EMAIL và GOOGLE_PRIVATE_KEY trong .env')
    return null
  }
  try {
    const doc = new GoogleSpreadsheet(sheetId, auth)
    await doc.loadInfo()
    let sheet = doc.sheetsByIndex[0]
    await sheet.setHeaderRow(['Discord Name', 'Ingame Name', 'Nguyện Vọng/Lý Do', 'Trạng Thái', 'Discord ID'])
    return sheet
  } catch (error) {
    console.error('Lỗi khi tải Google Sheet:', error.message)
    return null
  }
}

export async function syncUserRow(sheetId, userData) {
  const sheet = await initSheet(sheetId)
  if (!sheet) return false

  try {
    const rows = await sheet.getRows()
    let existingRow = rows.find(r => r.get('Discord ID') === userData.userId)

    const statusText = userData.status === 'JOINED' ? 'Tham gia' : (userData.status === 'NOT_JOINING' ? 'Từ chối' : 'Huỷ tham gia')

    if (existingRow) {
      existingRow.assign({
        'Discord Name': userData.username,
        'Ingame Name': userData.ingameName || existingRow.get('Ingame Name') || '',
        'Nguyện Vọng/Lý Do': userData.notes || existingRow.get('Nguyện Vọng/Lý Do') || '',
        'Trạng Thái': statusText
      })
      await existingRow.save()
    } else {
      existingRow = await sheet.addRow({
        'Discord Name': userData.username,
        'Ingame Name': userData.ingameName || '',
        'Nguyện Vọng/Lý Do': userData.notes || '',
        'Trạng Thái': statusText,
        'Discord ID': userData.userId
      })
    }

    // Xử lý bôi đỏ nếu huỷ
    const isCancelled = userData.status === 'CANCELLED'
    const rowIdxStart = existingRow.rowNumber
    await sheet.loadCells(`A${rowIdxStart}:E${rowIdxStart}`)
    
    for (let col = 0; col < 5; col++) {
      const cell = sheet.getCell(rowIdxStart - 1, col)
      if (isCancelled) {
        cell.backgroundColor = { red: 1, green: 0.8, blue: 0.8 } // Màu đỏ lạt
      } else {
        cell.backgroundColor = { red: 1, green: 1, blue: 1 } // Màu trắng
      }
    }
    await sheet.saveUpdatedCells()

    return true
  } catch (e) {
    console.error('Error syncing row:', e)
    return false
  }
}

export async function clearSheetData(sheetId) {
  const doc = new GoogleSpreadsheet(sheetId, auth)
  await doc.loadInfo()
  const sheet = doc.sheetsByIndex[0]
  if (!sheet) return false

  try {
    await sheet.clearRows()
    // Reset format for all possible rows (e.g., 100 rows)
    await sheet.loadCells('A2:E100')
    for (let r = 1; r < 100; r++) {
      for (let c = 0; c < 5; c++) {
        const cell = sheet.getCell(r, c)
        cell.backgroundColor = { red: 1, green: 1, blue: 1 }
        cell.value = null
      }
    }
    await sheet.saveUpdatedCells()
    return true
  } catch (e) {
    console.error('Error clearing sheet:', e)
    return false
  }
}

export async function writeHeartbeatInfo(sheetId) {
  const sheet = await initSheet(sheetId)
  if (!sheet) return false

  try {
    await sheet.loadCells('G1:G1')
    const cell = sheet.getCell(0, 6) // Cột G (index 6), Hàng 1 (index 0)
    
    // Giờ VN
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
    const timeStr = `${vnNow.getUTCHours().toString().padStart(2, '0')}:${vnNow.getUTCMinutes().toString().padStart(2, '0')} - ${vnNow.getUTCDate()}/${vnNow.getUTCMonth() + 1}`
    
    cell.value = `🟢 Bot Restart: ${timeStr}`
    await sheet.saveUpdatedCells()
    return true
  } catch (e) {
    console.error('Error writing heartbeat:', e)
    return false
  }
}
