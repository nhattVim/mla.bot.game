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
  balance: { type: Number, default: 1000 }
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
