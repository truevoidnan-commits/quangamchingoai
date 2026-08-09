/**
 * Sample data — seed data for initial demo
 */
export const SAMPLE_NOVEL_ID = 'sample-001';

export const sampleNovel = {
  id: SAMPLE_NOVEL_ID,
  title: 'Phàm Nhân Tu Tiên',
  description:
    'Một câu chuyện kể về hành trình tu tiên của Hàn Lập, xuất thân từ gia đình nghèo khó nơi thôn dã, từng bước bước lên con đường bất tử đầy chông gai và hiểm nguy. Đây là truyện tiêu biểu của thể loại tu tiên xứ Trung, nổi tiếng với hệ thống tu luyện chi tiết và tình tiết phát triển chậm mà chắc.',
  coverUrl: '',
  chapterCount: 3,
  createdAt: Date.now() - 86400000,
};

export const sampleChapters = [
  {
    id: 'sample-ch-001',
    novelId: SAMPLE_NOVEL_ID,
    title: 'Chương 1: Thôn Vu Tiểu Tử',
    content: `Hàn Lập nhìn lên bầu trời cao xanh, trong lòng không khỏi bồi hồi. Mười ba năm trôi qua kể từ cái ngày cậu rời bỏ thôn nhỏ Tứ Phương để đặt chân vào Thất Huyền Môn — một trong những tiểu môn phái tầm thường nhất vùng Yên Châu.

Không ai biết rằng, trong người cậu thiếu niên có vẻ ngoài bình thường này lại ẩn chứa một bí mật khiến cả thiên hạ tu tiên phải giật mình.

"Hàn Lập, hôm nay ngươi phải luyện công đến canh ba mới được nghỉ." Giọng nói lạnh lùng của sư huynh Trương Thiết vang lên sau lưng.

Hàn Lập khẽ nhíu mày, nhưng vẫn giữ vẻ mặt bình thản: "Tuân lệnh."

Đây là thực tế của một đệ tử tạp dịch. Không có linh căn xuất chúng, không có thân thế hiển hách, Hàn Lập chỉ có thể cúi đầu chịu đựng và chờ đợi thời cơ.

Song, thời cơ đó — có lẽ đã đến rồi.`,
    order: 0,
    isExtra: false,
  },
  {
    id: 'sample-ch-002',
    novelId: SAMPLE_NOVEL_ID,
    title: 'Chương 2: Bình Ngọc Huyền Bí',
    content: `Trong căn phòng nhỏ tối tăm, ánh đèn dầu leo lắt hắt bóng lên khuôn mặt trầm tư của Hàn Lập.

Trước mặt cậu là một chiếc bình nhỏ màu ngọc lục bảo, trông bình thường đến mức không ai thèm ngó ngàng. Song Hàn Lập biết — bình này không đơn giản chút nào.

Ba tháng trước, trong một lần dọn dẹp kho chứa đồ cũ của môn phái, Hàn Lập tình cờ nhặt được vật này. Kể từ đó, cậu phát hiện ra bí mật kinh thiên động địa của nó: bình có thể tăng tốc sự sinh trưởng của cây cỏ lên gấp trăm lần, thậm chí cải biến phẩm chất linh thảo.

"Nếu ta có thể dùng bình này để trồng linh thảo, rồi đem đổi lấy linh thạch..." Hàn Lập khẽ lẩm bẩm, trong mắt ánh lên tia sáng tính toán.

Con đường tu tiên không phải chỉ dựa vào thiên phú — mà còn cần tích lũy tài nguyên, tích lũy kinh nghiệm, và nhất là — tích lũy sự khôn ngoan.`,
    order: 1,
    isExtra: false,
  },
  {
    id: 'sample-ch-003',
    novelId: SAMPLE_NOVEL_ID,
    title: 'Ngoại truyện: Ký ức thôn Tứ Phương',
    content: `Ngày Hàn Lập rời đi, trời vừa hửng sáng.

Người cha già đứng trước cổng thôn, đôi tay chai sần cầm chặt cái túi vải nhỏ nhoi chứa mấy cái bánh bao còn ấm. Mẹ cậu thì đứng phía sau, khóe mắt đỏ hoe nhưng cố nở nụ cười.

"Lập à, đến nơi rồi phải chịu khó nghe lời thầy dạy. Nhà ta nghèo, không có gì cho con mang theo, chỉ có tấm lòng thương con của cha mẹ."

Hàn Lập gật đầu, không dám quay nhìn lại.

Nhiều năm về sau, mỗi khi đứng trước những thách thức tưởng chừng không vượt qua được, cậu lại nhớ đến buổi sáng hôm đó — nhớ đến đôi mắt của người cha, nhớ đến nụ cười cố che nước mắt của người mẹ.

Đó là lý do cậu không bao giờ bỏ cuộc.`,
    order: 2,
    isExtra: true,
  },
];

// Catalog entry for localStorage
export const sampleCatalogEntry = {
  id: SAMPLE_NOVEL_ID,
  title: 'Phàm Nhân Tu Tiên',
  coverUrl: '',
  chapterCount: 3,
};
