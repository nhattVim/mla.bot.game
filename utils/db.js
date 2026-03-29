import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

let isConnected = false;

// Connect to MongoDB
export async function connectDB() {
  if (isConnected) return;
  
  if (!process.env.MONGO_URI) {
    console.warn("⚠️ Bỏ qua kết nối MongoDB! Vui lòng cung cấp MONGO_URI trong file .env để dùng tính năng Database. Bot sẽ fallback để chống crash.");
    return;
  }
  
  try {
    const db = await mongoose.connect(process.env.MONGO_URI);
    isConnected = db.connections[0].readyState === 1;
    console.log("✅ Đã kết nối thành công đến hệ thống MongoDB Atlas!");
  } catch (error) {
    console.error("❌ Kết nối MongoDB thất bại:", error);
  }
}

// User Schema
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  balance: { type: Number, default: 1000 },
  lastDaily: { type: Date, default: null }
});

const User = mongoose.model('User', userSchema);

export async function getBalance(userId, username) {
  if (!isConnected) return 1000;
  try {
    let user = await User.findOne({ userId });
    if (!user) {
      user = new User({ userId, username, balance: 1000 });
      await user.save();
    }
    return user.balance;
  } catch (error) {
    console.error('Lỗi Database khi getBalance:', error);
    return 1000;
  }
}

export async function updateBalance(userId, username, amount) {
  if (!isConnected) return 1000;
  try {
    let user = await User.findOne({ userId });
    // Khởi tạo nếu chưa tồn tại
    if (!user) {
      user = new User({ userId, username, balance: 1000 });
    } else {
      user.username = username; // Cập nhật tên mới lỡ có đổi
    }
    
    user.balance += amount;
    await user.save();
    return user.balance;
  } catch (error) {
    console.error('Lỗi Database khi updateBalance:', error);
    return 1000;
  }
}

export async function checkBalance(userId, username, amount) {
  const balance = await getBalance(userId, username);
  return balance >= amount;
}

export async function claimDaily(userId, username) {
  if (!isConnected) return { success: false, message: 'Hệ thống DB đang offline!' };
  
  try {
    let user = await User.findOne({ userId });
    if (!user) {
      user = new User({ userId, username, balance: 1000 });
    } else {
      user.username = username;
    }

    const now = new Date();
    // So sánh thời gian theo GMT +7 (VN)
    const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);

    if (user.lastDaily) {
      const vnLast = new Date(user.lastDaily.getTime() + 7 * 60 * 60 * 1000);
      
      if (
        vnNow.getUTCFullYear() === vnLast.getUTCFullYear() &&
        vnNow.getUTCMonth() === vnLast.getUTCMonth() &&
        vnNow.getUTCDate() === vnLast.getUTCDate()
      ) {
        return { success: false, message: 'Hôm nay bạn đã nhận lương rồi! Hãy quay lại vào ngày mai (sau 00:00).' };
      }
    }

    const rewardCoins = Math.floor(Math.random() * (2000 - 200 + 1)) + 200;
    user.balance += rewardCoins;
    user.lastDaily = now; // Lưu DB dưới múi giờ UTC thực
    
    await user.save();
    return { success: true, reward: rewardCoins, balance: user.balance };
  } catch (error) {
    console.error('Crashed at claimDaily:', error);
    return { success: false, message: 'Hệ thống đang bảo trì.' };
  }
}
