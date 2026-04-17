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
  inventory: { type: Map, of: Number, default: {} },
  dailyPurchases: { type: Map, of: Number, default: {} },
  dailyItemUsage: { type: Map, of: Number, default: {} },
  lastPurchaseReset: { type: Date, default: null },
  rankLevel: { type: Number, default: 0 },
  rankPoints: { type: Number, default: 0 }
})

const User = mongoose.model('User', userSchema)

const wordChainSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  usedWords: { type: [String], default: [] },
  gameCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: false },
  currentLetter: { type: String, default: null },
  lastUserId: { type: String, default: null },
  scores: { type: mongoose.Schema.Types.Mixed, default: {} }
})

const WordChain = mongoose.model('WordChain', wordChainSchema)

const triviaSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: { type: [String], required: true },
  answer: { type: String, required: true }
})
const Trivia = mongoose.model('Trivia', triviaSchema)

const bangChienSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
  sheetLink: { type: String, required: true },
  sheetId: { type: String, required: true },
  isActive: { type: Boolean, default: false },
  roleId: { type: String, default: null },
  nextStartDate: { type: Date, default: null },
  currentCycleStart: { type: Date, default: null },
  usersJoined: { type: [Object], default: [] },
  weeklyMessageIds: { type: [String], default: [] },
  lastNotificationDate: { type: Date, default: null }
})

const BangChien = mongoose.model('BangChien', bangChienSchema)
const BangChienTest = mongoose.model('BangChienTest', bangChienSchema)

export async function seedTriviaIfEmpty(triviaArray) {
  if (!isConnected) return false
  try {
    const count = await Trivia.countDocuments()
    if (count === 0 && triviaArray && triviaArray.length > 0) {
      await Trivia.insertMany(triviaArray)
      console.log(`[Trivia] Đã nạp thành công ${triviaArray.length} câu hỏi gốc vào MongoDB!`)
    }
    return true
  } catch (error) {
    console.error('Lỗi khi nạp Trivia vào DB:', error)
    return false
  }
}

export async function getRandomTrivia() {
  if (!isConnected) return null
  try {
    const results = await Trivia.aggregate([{ $sample: { size: 1 } }])
    return results.length > 0 ? results[0] : null
  } catch (error) {
    console.error('Lỗi khi lấy Trivia từ DB:', error)
    return null
  }
}

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
        user.dailyPurchases = new Map()
        user.dailyItemUsage = new Map()
      }
    }
    
    if (!user.dailyPurchases) user.dailyPurchases = new Map()
    const currentDailyQty = user.dailyPurchases.get(itemId) || 0

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

    if (itemId === 'x2_reward' || itemId === 'bua_mien_tu') {
      const now = new Date()
      const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
    
      if (user.lastPurchaseReset) {
        const vnLastReset = new Date(user.lastPurchaseReset.getTime() + 7 * 60 * 60 * 1000)
        if (vnNow.getUTCFullYear() !== vnLastReset.getUTCFullYear() || vnNow.getUTCMonth() !== vnLastReset.getUTCMonth() || vnNow.getUTCDate() !== vnLastReset.getUTCDate()) {
          user.dailyItemUsage = new Map()
          user.dailyPurchases = new Map()
        }
      }
      
      if (!user.dailyItemUsage) user.dailyItemUsage = new Map()
      const currentUsage = user.dailyItemUsage.get(itemId) || 0
      
      if (currentUsage >= 4) {
        return false
      }
      user.dailyItemUsage.set(itemId, currentUsage + 1)
      user.set('lastPurchaseReset', now)
    }

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

export async function saveWordChainHistory(channelId, usedWords, gameCount) {
  if (!isConnected) return false
  try {
    await WordChain.findOneAndUpdate(
      { channelId },
      { usedWords, gameCount },
      { upsert: true }
    )
    return true
  } catch (error) {
    return false
  }
}

export async function saveWordChainState(channelId, stateInfo) {
  if (!isConnected) return false
  try {
    await WordChain.findOneAndUpdate(
      { channelId },
      { $set: stateInfo },
      { upsert: true }
    )
    return true
  } catch (error) {
    return false
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

export async function clearWordChainHistory(channelId) {
  if (!isConnected) return false
  try {
    await WordChain.deleteOne({ channelId })
    return true
  } catch (error) {
    return false
  }
}

// ========================
// HỆ THỐNG RANK HƯ DANH
// ========================

export async function spendCoinsForRank(userId, username, coinsToSpend) {
  if (!isConnected) return { success: false, message: 'Hệ thống DB đang offline!' }
  if (isNaN(coinsToSpend) || coinsToSpend <= 0) return { success: false, message: 'Số tiền không hợp lệ!' }
  try {
    let user = await User.findOne({ userId })
    if (!user) user = new User({ userId, username, balance: 1000 })
    
    if (user.balance < coinsToSpend) return { success: false, message: 'Số dư không đủ để chuyển hóa vinh quang!' }
    user.balance -= coinsToSpend
    await user.save()
    return { success: true, balance: user.balance }
  } catch (error) {
    return { success: false, message: 'Lỗi giao dịch đổi hạng!' }
  }
}

export async function getRankData(userId, username) {
  if (!isConnected) return { rankLevel: 0, rankPoints: 0 }
  try {
    let user = await User.findOne({ userId })
    if (!user) {
      user = new User({ userId, username })
      await user.save()
    }
    return { rankLevel: user.rankLevel || 0, rankPoints: user.rankPoints || 0 }
  } catch (err) {
    return { rankLevel: 0, rankPoints: 0 }
  }
}

export async function updateRankData(userId, username, rankLevel, rankPoints) {
  if (!isConnected) return false
  try {
    let user = await User.findOne({ userId })
    if (!user) {
      user = new User({ userId, username, rankLevel, rankPoints })
    } else {
      user.rankLevel = rankLevel
      user.rankPoints = rankPoints
      user.username = username
    }
    await user.save()
    return true
  } catch (err) {
    return false
  }
}

export async function getTopRanks(limit = 10) {
  if (!isConnected) return []
  try {
    return await User.find({ $or: [{ rankLevel: { $gt: 0 } }, { rankPoints: { $gt: 0 } }] })
      .sort({ rankLevel: -1, rankPoints: -1 })
      .limit(limit)
      .select('userId username rankLevel rankPoints -_id')
      .lean()
  } catch (e) {
    return []
  }
}

// ========================
// HỆ THỐNG BANG CHIẾN
// ========================

export async function getBangChienConfig(guildId, isTestMode = false) {
  if (!isConnected) return null
  try {
    const Model = isTestMode ? BangChienTest : BangChien
    return await Model.findOne({ guildId })
  } catch (error) {
    return null
  }
}

export async function setBangChienConfig(guildId, configData, isTestMode = false) {
  if (!isConnected) return null
  try {
    const Model = isTestMode ? BangChienTest : BangChien
    return await Model.findOneAndUpdate(
      { guildId },
      { $set: configData },
      { upsert: true, returnDocument: 'after' }
    )
  } catch (error) {
    console.error('Lỗi setBangChienConfig:', error)
    return null
  }
}

export async function updateBangChienUser(guildId, userData, isTestMode = false) {
  if (!isConnected) return false
  try {
    const Model = isTestMode ? BangChienTest : BangChien
    const config = await Model.findOne({ guildId })
    if (!config) return false
    
    const userIndex = config.usersJoined.findIndex(u => u.userId === userData.userId)
    if (userIndex >= 0) {
      config.usersJoined[userIndex] = { ...config.usersJoined[userIndex], ...userData }
    } else {
      config.usersJoined.push(userData)
    }
    
    config.markModified('usersJoined')
    await config.save()
    return true
  } catch (error) {
    console.error('Lỗi updateBangChienUser:', error)
    return false
  }
}

export async function clearBangChienUsersAndMessages(guildId, isTestMode = false) {
  if (!isConnected) return false
  try {
    const Model = isTestMode ? BangChienTest : BangChien
    await Model.findOneAndUpdate({ guildId }, { $set: { usersJoined: [], weeklyMessageIds: [] } })
    return true
  } catch (e) {
    return false
  }
}

export async function getAllBangChienConfigs(isTestMode = false) {
   if (!isConnected) return []
   try {
      const Model = isTestMode ? BangChienTest : BangChien
      return await Model.find()
   } catch(e) {
      return []
   }
}

export async function deleteBangChienConfig(guildId, isTestMode = false) {
  if (!isConnected) return false
  try {
    const Model = isTestMode ? BangChienTest : BangChien
    await Model.findOneAndDelete({ guildId })
    return true
  } catch (error) {
    console.error('Lỗi xoá config Bang Chien:', error)
    return false
  }
}
