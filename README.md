# 天機樓 · Thiên Cơ Lâu

> **Trình đọc truyện chữ cá nhân** — phong cách công nghệ hiện đại pha cổ trang huyền huyễn.

![Thiên Cơ Lâu](./public/favicon.svg)

## ✨ Tính năng

- 📚 **Thư viện truyện** — lưới card ảnh bìa 3:4, tìm kiếm tức thời, toggle Grid/List
- 📖 **Đọc truyện** — 6 bảng màu đọc (Giấy · Trắng · Tối · Đen · Xanh đêm · Rừng), tùy chỉnh font/cỡ chữ/giãn dòng
- ⚡ **Tự động tách chương** — từ file `.txt` hoặc `.epub`, nhận diện `Chương X`, `Hồi X`, `Quyển X`, Ngoại truyện
- 🔧 **Sửa lỗi dấu tiếng Việt** — tự động khi paste nội dung từ web
- 🔢 **Đếm số chữ real-time** — hiển thị `12.345 chữ`, nút Copy/Xóa
- 🔍 **Tìm kiếm full-text** — trong toàn bộ nội dung chương
- 💾 **Lưu trữ phía client** — localStorage (catalog) + IndexedDB (nội dung đầy đủ)
- 📱 **Mobile-first** — panel dạng bottom-sheet, thao tác một tay
- 🌟 **Giao diện WOW** — neon cyan + vàng kim + chữ Hán trang trí

## 🛠️ Yêu cầu

- **Node.js** v18 trở lên — tải tại [nodejs.org](https://nodejs.org)
- **npm** v9+ (đi kèm Node.js)

## 🚀 Cài đặt & Chạy

```bash
# 1. Di chuyển vào thư mục dự án
cd "Thiên Cơ Lâu"

# 2. Cài đặt các package
npm install

# 3. Chạy server phát triển
npm run dev
```

Sau khi chạy, mở trình duyệt tại: **http://localhost:3000**

## 📦 Build cho production

```bash
npm run build
# Output: thư mục dist/ — có thể deploy lên bất kỳ static host nào
```

## 📁 Cấu trúc thư mục

```
src/
├── components/
│   ├── layout/          # Header, Footer
│   ├── ui/              # BottomSheet, NovelCard, WordCounter, ScrollToTop
│   └── reader/          # TableOfContents, ReadingSettings
├── pages/               # LibraryPage, NovelDetailPage, ReaderPage, ...
├── hooks/               # useLongPress, useReadingSettings, useWordCount
├── lib/                 # db.js (IndexedDB), storage.js, chapterParser.js, ...
└── styles/              # globals.css, animations.css
```

## 📖 Hướng dẫn sử dụng

### Thêm truyện từ file
1. Nhấn **+ Thêm truyện** ở trang chủ
2. Nhập tên truyện, thêm ảnh bìa (upload hoặc URL)
3. Upload file `.txt` hoặc `.epub` — app sẽ tự động tách chương
4. Nhấn **Lưu truyện**

### Thêm chương thủ công
1. Mở trang thông tin truyện
2. Nhấn **+ Thêm chương**
3. Nhập tiêu đề, nội dung, chọn vị trí (hoặc để tự động chèn cuối)

### Long-press để sửa/xóa
- Trên mobile: **Giữ 0.6 giây** vào card truyện → menu sửa/xóa

### Tìm kiếm nội dung
- Tìm theo tên truyện: ô tìm kiếm ở trang chủ
- Tìm full-text trong chương: trang `/search`

---

*Thiết kế bởi **Minh Đỗ***
