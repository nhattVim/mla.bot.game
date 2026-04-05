import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

let isConnected = false

export async function connectDB() {
  if (isConnected) return
  if (!process.env.MONGO_URI) {
    console.warn('️Bỏ qua kết nối MongoDB! Vui lòng cung cấp MONGO_URI trong file .env để dùng tính năng Database. Bot sẽ fallback để chống crash.')
    return
  }
  try {
    const db = await mongoose.connect(process.env.MONGO_URI)
    isConnected = db.connections[0].readyState === 1
    console.log('Đã kết nối thành công đến hệ thống MongoDB Atlas!')
  } catch (error) {
    console.error('Kết nối MongoDB thất bại:', error)
  }
}

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  balance: { type: Number, default: 1000 },
  lastDaily: { type: Date, default: null },
  inventory: { type: Map, of: Number, default: {} }, // Map item -> count
  dailyPurchases: { type: Map, of: Number, default: {} }, // Map item -> count bought today
  lastPurchaseReset: { type: Date, default: null }
})

const User = mongoose.model('User', userSchema)

const wordChainSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  usedWords: { type: [String], default: [] },
  gameCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: false },
  currentLetter: { type: String, default: null },
  lastUserId: { type: String, default: null },
  scores: { type: Object, default: {} }
})

const WordChain = mongoose.model('WordChain', wordChainSchema)

export async function getBalance(userId, username) {
  if (!isConnected) return 1000
  try {
    let user = await User.findOne({ userId })
    if (!user) {
      user = new User({ userId, username, balance: 1000 })
      await user.save()
    }
    return user.balance
  } catch (error) {
    return 1000
  }
}

export async function updateBalance(userId, username, amount) {
  if (!isConnected) return 1000
  try {
    let user = await User.findOne({ userId })
    if (!user) user = new User({ userId, username, balance: 1000 })
    else user.username = username

    user.balance += amount
    await user.save()
    return user.balance
  } catch (error) {
    return 1000
  }
}

export async function checkBalance(userId, username, amount) {
  const balance = await getBalance(userId, username)
  return balance >= amount
}

export async function transferMoney(senderId, senderName, receiverId, receiverName, amount) {
  if (!isConnected) return { success: false, message: 'Hệ thống DB đang offline!' }
  try {
    let sender = await User.findOne({ userId: senderId })
    if (!sender) sender = new User({ userId: senderId, username: senderName, balance: 1000 })

    if (sender.balance < amount) return { success: false, message: 'Bạn không đủ tiền!' }

    let receiver = await User.findOne({ userId: receiverId })
    if (!receiver) receiver = new User({ userId: receiverId, username: receiverName, balance: 1000 })

    sender.balance -= amount
    receiver.balance += amount

    await sender.save()
    await receiver.save()

    return { success: true, senderBalance: sender.balance, receiverBalance: receiver.balance }
  } catch (error) {
    return { success: false, message: 'Lỗi giao dịch DB!' }
  }
}

export async function claimDaily(userId, username) {
  if (!isConnected) return { success: false, message: 'Hệ thống DB đang offline!' }
  try {
    let user = await User.findOne({ userId })
    if (!user) user = new User({ userId, username, balance: 1000 })
    else user.username = username

    const now = new Date()
    const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)

    if (user.toJSON().lastDaily) {
      const vnLast = new Date(user.lastDaily.getTime() + 7 * 60 * 60 * 1000)
      if (vnNow.getUTCFullYear() === vnLast.getUTCFullYear() && vnNow.getUTCMonth() === vnLast.getUTCMonth() && vnNow.getUTCDate() === vnLast.getUTCDate()) {
        return { success: false, message: 'Hôm nay bạn đã nhận lương rồi! Hãy quay lại vào ngày mai.' }
      }
    }

    const rewardCoins = Math.floor(Math.random() * (2000 - 200 + 1)) + 200
    user.balance += rewardCoins
    user.set('lastDaily', now)
    await user.save()
    return { success: true, reward: rewardCoins, balance: user.balance }
  } catch (error) {
    return { success: false, message: 'Hệ thống đang bảo trì.' }
  }
}

// ========================
// HỆ THỐNG SHOP (INVENTORY)
// ========================

export async function getUserInventory(userId, username) {
  if (!isConnected) return {}
  try {
    let user = await User.findOne({ userId })
    if (!user) return {}
    return user.inventory ? Object.fromEntries(user.inventory) : {}
  } catch (e) {
    return {}
  }
}

export async function grantItemDb(userId, username, itemId) {
  if (!isConnected) return false
  try {
    let user = await User.findOne({ userId })
    if (!user) user = new User({ userId, username, balance: 1000 })

    if (!user.inventory) user.inventory = new Map()
    const currentQty = user.inventory.get(itemId) || 0

    user.inventory.set(itemId, currentQty + 1)
    await user.save()
    return true
  } catch (e) {
    return false
  }
}

export async function buyItem(userId, username, itemId, cost) {
  if (!isConnected) return { success: false, message: 'Giao dịch DB bị lỗi!' }
  try {
    let user = await User.findOne({ userId })
    if (!user) user = new User({ userId, username, balance: 1000 })

    if (user.balance < cost) return { success: false, message: 'Bạn không đủ tiền để rước món này!' }

    if (!user.inventory) user.inventory = new Map()
    const currentQty = user.inventory.get(itemId) || 0

    // Reset daily purchases if new day (UTC+7)
    const now = new Date()
    const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
    
    if (user.lastPurchaseReset) {
      const vnLastReset = new Date(user.lastPurchaseReset.getTime() + 7 * 60 * 60 * 1000)
      if (vnNow.getUTCFullYear() !== vnLastReset.getUTCFullYear() || vnNow.getUTCMonth() !== vnLastReset.getUTCMonth() || vnNow.getUTCDate() !== vnLastReset.getUTCDate()) {
        user.dailyPurchases = new Map() // clear stats
      }
    }
    
    if (!user.dailyPurchases) user.dailyPurchases = new Map()
    const currentDailyQty = user.dailyPurchases.get(itemId) || 0

    // Daily limit check
    if (itemId === 'x2_reward' && currentDailyQty >= 4) {
      return { success: false, message: 'Bạn đã đạt giới hạn mua 4 Vé Nhân Đôi hôm nay, hãy quay lại vào ngày mai!' }
    }
    if (itemId === 'bua_mien_tu' && currentDailyQty >= 4) {
      return { success: false, message: 'Bạn đã đạt giới hạn mua 4 Bùa Miễn Tử hôm nay, hãy quay lại vào ngày mai!' }
    }

    if (itemId.startsWith('title_') && currentQty > 0) {
      return { success: false, message: 'Cái danh hiệu này bạn đã gắn chìm vào tên rồi mua chi nữa!' }
    }

    user.balance -= cost
    user.inventory.set(itemId, currentQty + 1)
    user.dailyPurchases.set(itemId, currentDailyQty + 1)
    user.set('lastPurchaseReset', now)
    await user.save()

    return { success: true, balance: user.balance }
  } catch (e) {
    return { success: false, message: 'Hỏng đường truyền Cửa hàng!' }
  }
}

export async function consumeItem(userId, itemId) {
  if (!isConnected) return false
  try {
    let user = await User.findOne({ userId })
    if (!user || !user.inventory) return false

    const qty = user.inventory.get(itemId) || 0
    if (qty <= 0) return false

    user.inventory.set(itemId, qty - 1)
    await user.save()
    return true
  } catch (e) {
    return false
  }
}

// ========================
// HỆ THỐNG GAME NỐI TỪ
// ========================

export async function getWordChainHistory(channelId) {
  if (!isConnected) return null
  try {
    return await WordChain.findOne({ channelId })
  } catch (error) {
    return null
  }
}

export async function getAllActiveWordChains() {
  if (!isConnected) return []
  try {
    return await WordChain.find({ isActive: true })
  } catch (error) {
    return []
  }
}

export async function saveWordChainState(channelId, stateData) {
  if (!isConnected) return false
  try {
    await WordChain.findOneAndUpdate(
      { channelId },
      { ...stateData },
      { upsert: true }
    )
    return true
  } catch (error) {
    return false
  }
}

export async function clearWordChainHistory(channelId) {
  if (!isConnected) return false
  try {
    await WordChain.deleteOne({ channelId })
    return true
  } catch (error) {
    return false
  }
}

