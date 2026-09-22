-- ============================================================
-- Seed MySQL: 8 môn + 26 chuyên đề + 25 câu mẫu HSG
-- Chạy 1 LẦN DUY NHẤT trong phpMyAdmin → chọn DB → tab SQL → Thực hiện
-- (subjects/topics dùng INSERT IGNORE nên chạy lại cũng không trùng)
-- ============================================================
SET NAMES utf8mb4;

INSERT IGNORE INTO subjects (id, name, code) VALUES
  ('toan', 'Toán', 'TOAN'),
  ('ly', 'Vật lí', 'LY'),
  ('hoa', 'Hóa học', 'HOA'),
  ('van', 'Ngữ văn', 'VAN'),
  ('anh', 'Tiếng Anh', 'ANH'),
  ('cn-nong', 'Công nghệ Nông nghiệp', 'CN-NN'),
  ('cn-chan', 'Công nghệ Chăn nuôi', 'CN-CN'),
  ('cn-lamthuy', 'Công nghệ Lâm nghiệp – Thủy sản', 'CN-LTS');

INSERT IGNORE INTO topics (id, subject_id, name, grade) VALUES
  ('toan-hamso', 'toan', 'Hàm số và đồ thị', 12),
  ('toan-tichphan', 'toan', 'Nguyên hàm – Tích phân', 12),
  ('toan-hinhkg', 'toan', 'Hình học không gian', 11),
  ('ly-dao-dong', 'ly', 'Dao động cơ', 12),
  ('ly-dien', 'ly', 'Dòng điện xoay chiều', 12),
  ('hoa-huuco', 'hoa', 'Hóa hữu cơ', 11),
  ('van-nghiluan', 'van', 'Nghị luận văn học', 12),
  ('anh-nguphap', 'anh', 'Ngữ pháp nâng cao', 12),
  ('cn-nong-dattrong', 'cn-nong', 'Đất trồng & giá thể', 10),
  ('cn-nong-phanbon', 'cn-nong', 'Phân bón & dinh dưỡng cây trồng', 11),
  ('cn-nong-giong', 'cn-nong', 'Giống cây trồng & nhân giống', 11),
  ('cn-nong-bvtv', 'cn-nong', 'Bảo vệ thực vật & dịch hại', 12),
  ('cn-nong-cncao', 'cn-nong', 'Nông nghiệp công nghệ cao', 12),
  ('cn-nong-baoquan', 'cn-nong', 'Thu hoạch, bảo quản & chế biến', 12),
  ('cn-chan-giong', 'cn-chan', 'Giống vật nuôi', 11),
  ('cn-chan-thucan', 'cn-chan', 'Thức ăn & dinh dưỡng vật nuôi', 11),
  ('cn-chan-chuong', 'cn-chan', 'Chuồng trại & môi trường', 11),
  ('cn-chan-thuy', 'cn-chan', 'Thú y & phòng trị bệnh', 12),
  ('cn-chan-cncao', 'cn-chan', 'Chăn nuôi công nghệ cao & ATSH', 12),
  ('cn-chan-chebien', 'cn-chan', 'Thu hoạch, bảo quản & chế biến SP chăn nuôi', 12),
  ('cn-lam-rung', 'cn-lamthuy', 'Giống cây rừng & trồng rừng', 11),
  ('cn-lam-quanly', 'cn-lamthuy', 'Quản lý, bảo vệ rừng & môi trường', 12),
  ('cn-thuy-giong', 'cn-lamthuy', 'Giống & thức ăn thủy sản', 11),
  ('cn-thuy-nuoi', 'cn-lamthuy', 'Kỹ thuật nuôi trồng thủy sản', 12),
  ('cn-thuy-benh', 'cn-lamthuy', 'Phòng trị bệnh thủy sản', 12),
  ('cn-thuy-chebien', 'cn-lamthuy', 'Thu hoạch, bảo quản & chế biến lâm-thủy sản', 12);

-- Câu hỏi mẫu: chỉ chạy khi bảng questions còn trống
INSERT INTO questions
  (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source)
SELECT * FROM (
  SELECT 'toan' AS subject_id, 'toan-hamso' AS topic_id, 12 AS grade, 'vận dụng' AS difficulty, 'trac_nghiem' AS qtype,
    'Cho hàm số y = x^3 - 3x + 1. Số điểm cực trị của đồ thị hàm số là:' AS content,
    '["0", "1", "2", "3"]' AS options, 'C' AS correct_answer,
    'y'' = 3x^2 - 3 = 0 ⇔ x = ±1 nên có 2 điểm cực trị.' AS explanation, 1 AS score, 'mẫu' AS source
  UNION ALL SELECT 'toan', 'toan-hamso', 12, 'thông hiểu', 'trac_nghiem',
    'Giá trị lớn nhất của hàm số y = -x^2 + 4x - 3 trên đoạn [0; 4] là:',
    '["1", "0", "4", "-3"]', 'A', 'Đỉnh parabol tại x = 2, y = 1.', 1, 'mẫu'
  UNION ALL SELECT 'toan', 'toan-tichphan', 12, 'vận dụng cao', 'tu_luan',
    'Tính tích phân I = ∫(0→1) x·e^x dx. Trình bày từng bước.',
    '[]', 'I = 1 (tích phân từng phần: u = x, dv = e^x dx).',
    'Đặt u = x, dv = e^x dx ⇒ I = [x·e^x](0→1) - ∫e^x dx = e - (e - 1) = 1.', 2, 'mẫu'
  UNION ALL SELECT 'toan', 'toan-hinhkg', 11, 'vận dụng', 'trac_nghiem',
    'Cho hình chóp S.ABCD có đáy là hình vuông cạnh a, SA ⊥ đáy, SA = a. Thể tích khối chóp là:',
    '["a^3/3", "a^3", "a^3/2", "2a^3/3"]', 'A', 'V = (1/3)·a^2·a = a^3/3.', 1, 'mẫu'
  UNION ALL SELECT 'ly', 'ly-dao-dong', 12, 'thông hiểu', 'trac_nghiem',
    'Một con lắc lò xo dao động điều hòa với chu kì T. Tần số góc ω bằng:',
    '["2πT", "T/2π", "2π/T", "1/T"]', 'C', 'ω = 2π/T.', 1, 'mẫu'
  UNION ALL SELECT 'ly', 'ly-dien', 12, 'vận dụng', 'trac_nghiem',
    'Đặt điện áp u = 220√2·cos(100πt) V vào điện trở 110 Ω. Công suất tiêu thụ là:',
    '["220 W", "440 W", "110 W", "880 W"]', 'B', 'P = U²/R = 220²/110 = 440 W.', 1, 'mẫu'
  UNION ALL SELECT 'ly', 'ly-dao-dong', 12, 'vận dụng cao', 'tu_luan',
    'Nêu cách xác định gia tốc trọng trường bằng con lắc đơn trong phòng thí nghiệm (dụng cụ, các bước, xử lí số liệu).',
    '[]', 'T = 2π√(l/g) ⇒ g = 4π²l/T²; đo l, đo T nhiều lần rồi tính trung bình.',
    'Cần đo chiều dài, đo thời gian 20–30 dao động, lặp lại, tính sai số.', 2, 'mẫu'
  UNION ALL SELECT 'hoa', 'hoa-huuco', 11, 'nhận biết', 'trac_nghiem',
    'Chất nào sau đây thuộc dãy đồng đẳng ankan?',
    '["C2H4", "C3H8", "C2H2", "C6H6"]', 'B', 'Ankan có công thức CnH2n+2.', 1, 'mẫu'
  UNION ALL SELECT 'hoa', 'hoa-huuco', 11, 'vận dụng', 'tu_luan',
    'Viết phương trình đốt cháy hoàn toàn ethanol và tính thể tích CO2 (đkc) khi đốt 9,2 g ethanol.',
    '[]', 'C2H5OH + 3O2 → 2CO2 + 3H2O; n = 0,2 mol ⇒ V(CO2) ≈ 9,916 L (đkc).',
    'Cân bằng PTHH, tính mol rồi suy ra thể tích khí.', 2, 'mẫu'
  UNION ALL SELECT 'van', 'van-nghiluan', 12, 'vận dụng', 'tu_luan',
    'Phân tích hình tượng người lái đò trong tùy bút ''Người lái đò Sông Đà'' (Nguyễn Tuân). Lập dàn ý chi tiết.',
    '[]', 'Dàn ý: mở bài – thân bài (vẻ đẹp hung bạo/trữ tình của sông Đà; vẻ đẹp tài hoa, trí dũng của ông lái đò) – kết bài.',
    'Chấm theo bố cục, dẫn chứng, lí lẽ và diễn đạt; tự đối chiếu với đáp án.', 3, 'mẫu'
  UNION ALL SELECT 'anh', 'anh-nguphap', 12, 'vận dụng', 'trac_nghiem',
    'Choose the best answer: By the time we arrived, the competition _____.',
    '["has started", "had started", "starts", "will start"]', 'B',
    'Hành động xảy ra trước một mốc trong quá khứ → past perfect.', 1, 'mẫu'
  UNION ALL SELECT 'anh', 'anh-nguphap', 12, 'thông hiểu', 'trac_nghiem',
    'The proposal was approved _____ a majority vote.',
    '["with", "by", "for", "in"]', 'B', '''by a majority vote'' là cụm cố định.', 1, 'mẫu'
  UNION ALL SELECT 'cn-nong', 'cn-nong-dattrong', 10, 'thông hiểu', 'trac_nghiem',
    'Keo đất có vai trò quan trọng nhất nào đối với dinh dưỡng cây trồng?',
    '["Giữ nước cơ học", "Hấp phụ và trao đổi cation (CEC), giữ dinh dưỡng", "Tạo màu cho đất", "Diệt vi sinh vật"]',
    'B', 'Keo đất quyết định khả năng hấp phụ – trao đổi ion, giữ dinh dưỡng chống rửa trôi.', 1, 'mẫu-cn'
  UNION ALL SELECT 'cn-nong', 'cn-nong-phanbon', 11, 'vận dụng', 'trac_nghiem',
    'Ruộng lúa thiếu đạm (N) thường biểu hiện trước tiên ở:',
    '["Lá già vàng từ chóp và mép lá lan dần", "Đốm nâu trên lá non", "Thối rễ", "Cong lá non"]',
    'A', 'N linh động nên triệu chứng thiếu hiện ở lá già trước: vàng úa từ chóp/mép.', 1, 'mẫu-cn'
  UNION ALL SELECT 'cn-nong', 'cn-nong-giong', 11, 'vận dụng', 'tu_luan',
    'So sánh ưu – nhược điểm của nhân giống vô tính (giâm, chiết, ghép) với gieo hạt trong sản xuất cây ăn quả. Nêu 1 ví dụ đội tuyển hay gặp.',
    '[]', 'Vô tính: giữ nguyên đặc tính mẹ, ra quả sớm, đồng đều; nhược: bộ rễ yếu hơn, lây bệnh hệ thống, thoái hóa nếu lạm dụng. Ví dụ: ghép xoài, chiết bưởi.',
    'Chấm theo 3 ý: giữ kiểu gen – thời gian cho quả – rủi ro dịch bệnh/bộ rễ. Tự đối chiếu.', 2, 'mẫu-cn'
  UNION ALL SELECT 'cn-nong', 'cn-nong-bvtv', 12, 'vận dụng cao', 'tu_luan',
    'Trình bày nguyên tắc IPM (quản lý dịch hại tổng hợp) trên lúa. Lập sơ đồ các biện pháp từ canh tác – sinh học – hóa học, nêu ngưỡng phòng trừ.',
    '[]', 'IPM: phòng là chính (giống kháng, vệ sinh đồng, luân canh), theo dõi bẫy + ngưỡng, ưu tiên sinh học/thảo mộc, hóa học là cuối cùng – đúng thuốc, đúng lúc, đúng liều.',
    'Barem HSG: 0,5đ nguyên tắc + 1đ nhóm biện pháp + 0,5đ ngưỡng/ví dụ (rầy nâu, đạo ôn).', 3, 'mẫu-cn'
  UNION ALL SELECT 'cn-nong', 'cn-nong-cncao', 12, 'vận dụng', 'trac_nghiem',
    'Ưu điểm lớn nhất của tưới nhỏ giọt kết hợp cảm biến ẩm trong nhà màng là:',
    '["Tăng công lao động", "Tiết kiệm nước – phân, ổn định ẩm vùng rễ", "Tăng cỏ dại", "Không cần điện"]',
    'B', 'Tưới nhỏ giọt + cảm biến giúp tiết kiệm 30–60% nước, đưa phân theo nước (fertigation).', 1, 'mẫu-cn'
  UNION ALL SELECT 'cn-chan', 'cn-chan-giong', 11, 'thông hiểu', 'trac_nghiem',
    'Chỉ tiêu quan trọng nhất khi chọn lợn nái hậu bị cho đội giống là:',
    '["Màu lông đẹp", "Ngoại hình cân đối, vú đều, lý lịch sinh sản tốt", "Ăn nhiều", "Kêu to"]',
    'B', 'Chọn theo ngoại hình + năng suất bố mẹ + số vú, khoảng cách vú.', 1, 'mẫu-cn'
  UNION ALL SELECT 'cn-chan', 'cn-chan-thucan', 11, 'vận dụng', 'trac_nghiem',
    'Protein thô trong khẩu phần gà đẻ cần cao hơn gà thịt giai đoạn vỗ béo vì:',
    '["Để tăng mỡ", "Để tạo trứng (lòng trắng) và duy trì đẻ", "Để giảm đẻ", "Để tăng nước uống"]',
    'B', 'Gà đẻ cần ~16–18% protein để tạo trứng.', 1, 'mẫu-cn'
  UNION ALL SELECT 'cn-chan', 'cn-chan-thuy', 12, 'vận dụng cao', 'tu_luan',
    'Lập quy trình an toàn sinh học (ATSH) cho trại gà 5000 con phòng cúm gia cầm: từ cổng – chuồng – con người – xử lý chất thải.',
    '[]', 'ATSH 4 lớp: cách ly (hàng rào, hố sát trùng, all-in/all-out) – vệ sinh (phun, thay quần áo) – vaccine + giám sát – xử lý phân/xác đúng (ủ, đốt/chôn).',
    'Barem: mỗi lớp 0,5–0,75đ + ví dụ lịch vaccine.', 3, 'mẫu-cn'
  UNION ALL SELECT 'cn-chan', 'cn-chan-chuong', 11, 'vận dụng', 'tu_luan',
    'Nêu yêu cầu tiểu khí hậu chuồng bò sữa (nhiệt độ, ẩm, thông thoáng, nền) và cách chống nóng ẩm ở miền Bắc.',
    '[]', '18–25°C, ẩm 60–75%, thoáng, nền khô – dốc 2–3%. Chống nóng: mái cao, phun sương + quạt, trồng cây, mật độ hợp lý.',
    'Chấm theo 4 yếu tố + 2 giải pháp chống nóng.', 2, 'mẫu-cn'
  UNION ALL SELECT 'cn-lamthuy', 'cn-lam-rung', 11, 'thông hiểu', 'trac_nghiem',
    'Kỹ thuật tạo cây con bằng bầu đất trong lâm nghiệp nhằm:',
    '["Giảm tỉ lệ sống", "Bảo vệ bộ rễ, nâng tỉ lệ sống khi trồng rừng", "Tăng sâu bệnh", "Không cần chăm sóc"]',
    'B', 'Bầu giúp rễ nguyên vẹn, cây hồi xanh nhanh.', 1, 'mẫu-cn'
  UNION ALL SELECT 'cn-lamthuy', 'cn-lam-quanly', 12, 'vận dụng', 'tu_luan',
    'Nêu vai trò của rừng phòng hộ đầu nguồn và đề xuất 3 giải pháp quản lý bền vững ở địa phương em.',
    '[]', 'Chắn lũ, giữ nước, chống xói mòn, đa dạng sinh học. Giải pháp: giao đất rừng + chi trả DVMTR, tuần tra cộng đồng, trồng rừng hỗn loài.',
    '0,75đ vai trò + 1,25đ giải pháp thực tế.', 2, 'mẫu-cn'
  UNION ALL SELECT 'cn-lamthuy', 'cn-thuy-nuoi', 12, 'vận dụng', 'trac_nghiem',
    'Yếu tố nước quan trọng nhất phải kiểm tra mỗi sáng trong ao nuôi tôm thâm canh là:',
    '["Màu quần áo công nhân", "Oxy hòa tan (DO), pH, NH3/khí độc", "Tiếng quạt", "Giá tôm"]',
    'B', 'DO sáng sớm thấp nhất; NH3/NO2 gây độc sau cho ăn.', 1, 'mẫu-cn'
  UNION ALL SELECT 'cn-lamthuy', 'cn-thuy-benh', 12, 'vận dụng cao', 'tu_luan',
    'Trình bày quy trình phòng bệnh tổng hợp cho cá rô phi nuôi lồng: từ con giống – mật độ – thức ăn – xử lý nước – vaccine/hóa chất.',
    '[]', 'Giống sạch kiểm dịch – mật độ hợp lý – ăn đúng, không thừa – treo túi vôi/thuốc định kỳ – tắm muối/KMnO4 khi vận chuyển – cách ly cá bệnh.',
    'Chấm theo chuỗi phòng > trị; nêu được 5 mắt xích.', 3, 'mẫu-cn'
) AS seed
WHERE (SELECT COUNT(*) FROM questions) = 0;
