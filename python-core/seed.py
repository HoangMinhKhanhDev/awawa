import json
from datetime import datetime


CN_SUBJECTS = [
    ("cn-nong", "CÃ´ng nghá»‡ NÃ´ng nghiá»‡p", "CN-NN"),
    ("cn-chan", "CÃ´ng nghá»‡ ChÄƒn nuÃ´i", "CN-CN"),
    ("cn-lamthuy", "CÃ´ng nghá»‡ LÃ¢m nghiá»‡p â€“ Thá»§y sáº£n", "CN-LTS"),
]

CN_TOPICS = [
    ("cn-nong-dattrong", "cn-nong", "Äáº¥t trá»“ng & giÃ¡ thá»ƒ", 10),
    ("cn-nong-phanbon", "cn-nong", "PhÃ¢n bÃ³n & dinh dÆ°á»¡ng cÃ¢y trá»“ng", 11),
    ("cn-nong-giong", "cn-nong", "Giá»‘ng cÃ¢y trá»“ng & nhÃ¢n giá»‘ng", 11),
    ("cn-nong-bvtv", "cn-nong", "Báº£o vá»‡ thá»±c váº­t & dá»‹ch háº¡i", 12),
    ("cn-nong-cncao", "cn-nong", "NÃ´ng nghiá»‡p cÃ´ng nghá»‡ cao", 12),
    ("cn-nong-baoquan", "cn-nong", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n", 12),
    ("cn-chan-giong", "cn-chan", "Giá»‘ng váº­t nuÃ´i", 11),
    ("cn-chan-thucan", "cn-chan", "Thá»©c Äƒn & dinh dÆ°á»¡ng váº­t nuÃ´i", 11),
    ("cn-chan-chuong", "cn-chan", "Chuá»“ng tráº¡i & mÃ´i trÆ°á»ng", 11),
    ("cn-chan-thuy", "cn-chan", "ThÃº y & phÃ²ng trá»‹ bá»‡nh", 12),
    ("cn-chan-cncao", "cn-chan", "ChÄƒn nuÃ´i cÃ´ng nghá»‡ cao & ATSH", 12),
    ("cn-chan-chebien", "cn-chan", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n SP chÄƒn nuÃ´i", 12),
    ("cn-lam-rung", "cn-lamthuy", "Giá»‘ng cÃ¢y rá»«ng & trá»“ng rá»«ng", 11),
    ("cn-lam-quanly", "cn-lamthuy", "Quáº£n lÃ½, báº£o vá»‡ rá»«ng & mÃ´i trÆ°á»ng", 12),
    ("cn-thuy-giong", "cn-lamthuy", "Giá»‘ng & thá»©c Äƒn thá»§y sáº£n", 11),
    ("cn-thuy-nuoi", "cn-lamthuy", "Ká»¹ thuáº­t nuÃ´i trá»“ng thá»§y sáº£n", 12),
    ("cn-thuy-benh", "cn-lamthuy", "PhÃ²ng trá»‹ bá»‡nh thá»§y sáº£n", 12),
    ("cn-thuy-chebien", "cn-lamthuy", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n lÃ¢m-thá»§y sáº£n", 12),
]


def seed(db):
    now = datetime.now().isoformat(timespec="seconds")
    subjects = [
        ("toan", "ToÃ¡n", "TOAN"),
        ("ly", "Váº­t lÃ­", "LY"),
        ("hoa", "HÃ³a há»c", "HOA"),
        ("van", "Ngá»¯ vÄƒn", "VAN"),
        ("anh", "Tiáº¿ng Anh", "ANH"),
        ("cn-nong", "CÃ´ng nghá»‡ NÃ´ng nghiá»‡p", "CN-NN"),
        ("cn-chan", "CÃ´ng nghá»‡ ChÄƒn nuÃ´i", "CN-CN"),
        ("cn-lamthuy", "CÃ´ng nghá»‡ LÃ¢m nghiá»‡p â€“ Thá»§y sáº£n", "CN-LTS"),
    ]
    for sid, name, code in subjects:
        db.exec("INSERT OR IGNORE INTO subjects (id, name, code) VALUES (?,?,?)", (sid, name, code))
    topics = [
        ("toan-hamso", "toan", "HÃ m sá»‘ vÃ  Ä‘á»“ thá»‹", 12),
        ("toan-tichphan", "toan", "NguyÃªn hÃ m â€“ TÃ­ch phÃ¢n", 12),
        ("toan-hinhkg", "toan", "HÃ¬nh há»c khÃ´ng gian", 11),
        ("ly-dao-dong", "ly", "Dao Ä‘á»™ng cÆ¡", 12),
        ("ly-dien", "ly", "DÃ²ng Ä‘iá»‡n xoay chiá»u", 12),
        ("hoa-huuco", "hoa", "HÃ³a há»¯u cÆ¡", 11),
        ("van-nghiluan", "van", "Nghá»‹ luáº­n vÄƒn há»c", 12),
        ("anh-nguphap", "anh", "Ngá»¯ phÃ¡p nÃ¢ng cao", 12),
        # --- CÃ´ng nghá»‡ NÃ´ng nghiá»‡p ---
        ("cn-nong-dattrong", "cn-nong", "Äáº¥t trá»“ng & giÃ¡ thá»ƒ", 10),
        ("cn-nong-phanbon", "cn-nong", "PhÃ¢n bÃ³n & dinh dÆ°á»¡ng cÃ¢y trá»“ng", 11),
        ("cn-nong-giong", "cn-nong", "Giá»‘ng cÃ¢y trá»“ng & nhÃ¢n giá»‘ng", 11),
        ("cn-nong-bvtv", "cn-nong", "Báº£o vá»‡ thá»±c váº­t & dá»‹ch háº¡i", 12),
        ("cn-nong-cncao", "cn-nong", "NÃ´ng nghiá»‡p cÃ´ng nghá»‡ cao", 12),
        ("cn-nong-baoquan", "cn-nong", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n", 12),
        # --- CÃ´ng nghá»‡ ChÄƒn nuÃ´i ---
        ("cn-chan-giong", "cn-chan", "Giá»‘ng váº­t nuÃ´i", 11),
        ("cn-chan-thucan", "cn-chan", "Thá»©c Äƒn & dinh dÆ°á»¡ng váº­t nuÃ´i", 11),
        ("cn-chan-chuong", "cn-chan", "Chuá»“ng tráº¡i & mÃ´i trÆ°á»ng", 11),
        ("cn-chan-thuy", "cn-chan", "ThÃº y & phÃ²ng trá»‹ bá»‡nh", 12),
        ("cn-chan-cncao", "cn-chan", "ChÄƒn nuÃ´i cÃ´ng nghá»‡ cao & ATSH", 12),
        ("cn-chan-chebien", "cn-chan", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n SP chÄƒn nuÃ´i", 12),
        # --- LÃ¢m nghiá»‡p â€“ Thá»§y sáº£n ---
        ("cn-lam-rung", "cn-lamthuy", "Giá»‘ng cÃ¢y rá»«ng & trá»“ng rá»«ng", 11),
        ("cn-lam-quanly", "cn-lamthuy", "Quáº£n lÃ½, báº£o vá»‡ rá»«ng & mÃ´i trÆ°á»ng", 12),
        ("cn-thuy-giong", "cn-lamthuy", "Giá»‘ng & thá»©c Äƒn thá»§y sáº£n", 11),
        ("cn-thuy-nuoi", "cn-lamthuy", "Ká»¹ thuáº­t nuÃ´i trá»“ng thá»§y sáº£n", 12),
        ("cn-thuy-benh", "cn-lamthuy", "PhÃ²ng trá»‹ bá»‡nh thá»§y sáº£n", 12),
        ("cn-thuy-chebien", "cn-lamthuy", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n lÃ¢m-thá»§y sáº£n", 12),
    ]
    for tid, sid, name, grade in topics:
        db.exec("INSERT OR IGNORE INTO topics (id, subject_id, name, grade) VALUES (?,?,?,?)", (tid, sid, name, grade))

    Q = [
        ("toan", "toan-hamso", 12, "váº­n dá»¥ng", "trac_nghiem", "Cho hÃ m sá»‘ y = x^3 - 3x + 1. Sá»‘ Ä‘iá»ƒm cá»±c trá»‹ cá»§a Ä‘á»“ thá»‹ hÃ m sá»‘ lÃ :", ["0", "1", "2", "3"], "C", "y' = 3x^2 - 3 = 0 â‡” x = Â±1 nÃªn cÃ³ 2 Ä‘iá»ƒm cá»±c trá»‹.", 1),
        ("toan", "toan-hamso", 12, "thÃ´ng hiá»ƒu", "trac_nghiem", "GiÃ¡ trá»‹ lá»›n nháº¥t cá»§a hÃ m sá»‘ y = -x^2 + 4x - 3 trÃªn Ä‘oáº¡n [0; 4] lÃ :", ["1", "0", "4", "-3"], "A", "Äá»‰nh parabol táº¡i x = 2, y = 1.", 1),
        ("toan", "toan-tichphan", 12, "váº­n dá»¥ng cao", "tu_luan", "TÃ­nh tÃ­ch phÃ¢n I = âˆ«(0â†’1) xÂ·e^x dx. TrÃ¬nh bÃ y tá»«ng bÆ°á»›c.", "", "I = 1 (tÃ­ch phÃ¢n tá»«ng pháº§n: u = x, dv = e^x dx).", "Äáº·t u = x, dv = e^x dx â‡’ I = [xÂ·e^x](0â†’1) - âˆ«e^x dx = e - (e - 1) = 1.", 2),
        ("toan", "toan-hinhkg", 11, "váº­n dá»¥ng", "trac_nghiem", "Cho hÃ¬nh chÃ³p S.ABCD cÃ³ Ä‘Ã¡y lÃ  hÃ¬nh vuÃ´ng cáº¡nh a, SA âŠ¥ Ä‘Ã¡y, SA = a. Thá»ƒ tÃ­ch khá»‘i chÃ³p lÃ :", ["a^3/3", "a^3", "a^3/2", "2a^3/3"], "A", "V = (1/3)Â·a^2Â·a = a^3/3.", 1),
        ("ly", "ly-dao-dong", 12, "thÃ´ng hiá»ƒu", "trac_nghiem", "Má»™t con láº¯c lÃ² xo dao Ä‘á»™ng Ä‘iá»u hÃ²a vá»›i chu kÃ¬ T. Táº§n sá»‘ gÃ³c Ï‰ báº±ng:", ["2Ï€T", "T/2Ï€", "2Ï€/T", "1/T"], "C", "Ï‰ = 2Ï€/T.", 1),
        ("ly", "ly-dien", 12, "váº­n dá»¥ng", "trac_nghiem", "Äáº·t Ä‘iá»‡n Ã¡p u = 220âˆš2Â·cos(100Ï€t) V vÃ o Ä‘iá»‡n trá»Ÿ 110 Î©. CÃ´ng suáº¥t tiÃªu thá»¥ lÃ :", ["220 W", "440 W", "110 W", "880 W"], "B", "P = UÂ²/R = 220Â²/110 = 440 W.", 1),
        ("ly", "ly-dao-dong", 12, "váº­n dá»¥ng cao", "tu_luan", "NÃªu cÃ¡ch xÃ¡c Ä‘á»‹nh gia tá»‘c trá»ng trÆ°á»ng báº±ng con láº¯c Ä‘Æ¡n trong phÃ²ng thÃ­ nghiá»‡m (dá»¥ng cá»¥, cÃ¡c bÆ°á»›c, xá»­ lÃ­ sá»‘ liá»‡u).", "", "T = 2Ï€âˆš(l/g) â‡’ g = 4Ï€Â²l/TÂ²; Ä‘o l, Ä‘o T nhiá»u láº§n rá»“i tÃ­nh trung bÃ¬nh.", "Cáº§n Ä‘o chiá»u dÃ i, Ä‘o thá»i gian 20â€“30 dao Ä‘á»™ng, láº·p láº¡i, tÃ­nh sai sá»‘.", 2),
        ("hoa", "hoa-huuco", 11, "nháº­n biáº¿t", "trac_nghiem", "Cháº¥t nÃ o sau Ä‘Ã¢y thuá»™c dÃ£y Ä‘á»“ng Ä‘áº³ng ankan?", ["C2H4", "C3H8", "C2H2", "C6H6"], "B", "Ankan cÃ³ cÃ´ng thá»©c CnH2n+2.", 1),
        ("hoa", "hoa-huuco", 11, "váº­n dá»¥ng", "tu_luan", "Viáº¿t phÆ°Æ¡ng trÃ¬nh Ä‘á»‘t chÃ¡y hoÃ n toÃ n ethanol vÃ  tÃ­nh thá»ƒ tÃ­ch CO2 (Ä‘kc) khi Ä‘á»‘t 9,2 g ethanol.", "", "C2H5OH + 3O2 â†’ 2CO2 + 3H2O; n = 0,2 mol â‡’ V(CO2) â‰ˆ 9,916 L (Ä‘kc).", "CÃ¢n báº±ng PTHH, tÃ­nh mol rá»“i suy ra thá»ƒ tÃ­ch khÃ­.", 2),
        ("van", "van-nghiluan", 12, "váº­n dá»¥ng", "tu_luan", "PhÃ¢n tÃ­ch hÃ¬nh tÆ°á»£ng ngÆ°á»i lÃ¡i Ä‘Ã² trong tÃ¹y bÃºt 'NgÆ°á»i lÃ¡i Ä‘Ã² SÃ´ng ÄÃ ' (Nguyá»…n TuÃ¢n). Láº­p dÃ n Ã½ chi tiáº¿t.", "", "DÃ n Ã½: má»Ÿ bÃ i â€“ thÃ¢n bÃ i (váº» Ä‘áº¹p hung báº¡o/trá»¯ tÃ¬nh cá»§a sÃ´ng ÄÃ ; váº» Ä‘áº¹p tÃ i hoa, trÃ­ dÅ©ng cá»§a Ã´ng lÃ¡i Ä‘Ã²) â€“ káº¿t bÃ i.", "Cháº¥m theo bá»‘ cá»¥c, dáº«n chá»©ng, lÃ­ láº½ vÃ  diá»…n Ä‘áº¡t; tá»± Ä‘á»‘i chiáº¿u vá»›i Ä‘Ã¡p Ã¡n.", 3),
        ("anh", "anh-nguphap", 12, "váº­n dá»¥ng", "trac_nghiem", "Choose the best answer: By the time we arrived, the competition _____.", ["has started", "had started", "starts", "will start"], "B", "HÃ nh Ä‘á»™ng xáº£y ra trÆ°á»›c má»™t má»‘c trong quÃ¡ khá»© â†’ past perfect.", 1),
        ("anh", "anh-nguphap", 12, "thÃ´ng hiá»ƒu", "trac_nghiem", "The proposal was approved _____ a majority vote.", ["with", "by", "for", "in"], "B", "'by a majority vote' lÃ  cá»¥m cá»‘ Ä‘á»‹nh.", 1),
        # --- Máº«u CÃ´ng nghá»‡ NÃ´ng nghiá»‡p (HSG/Ä‘á»™i tuyá»ƒn) ---
        ("cn-nong", "cn-nong-dattrong", 10, "thÃ´ng hiá»ƒu", "trac_nghiem", "Keo Ä‘áº¥t cÃ³ vai trÃ² quan trá»ng nháº¥t nÃ o Ä‘á»‘i vá»›i dinh dÆ°á»¡ng cÃ¢y trá»“ng?", ["Giá»¯ nÆ°á»›c cÆ¡ há»c", "Háº¥p phá»¥ vÃ  trao Ä‘á»•i cation (CEC), giá»¯ dinh dÆ°á»¡ng", "Táº¡o mÃ u cho Ä‘áº¥t", "Diá»‡t vi sinh váº­t"], "B", "Keo Ä‘áº¥t quyáº¿t Ä‘á»‹nh kháº£ nÄƒng háº¥p phá»¥ â€“ trao Ä‘á»•i ion, giá»¯ dinh dÆ°á»¡ng chá»‘ng rá»­a trÃ´i.", 1),
        ("cn-nong", "cn-nong-phanbon", 11, "váº­n dá»¥ng", "trac_nghiem", "Ruá»™ng lÃºa thiáº¿u Ä‘áº¡m (N) thÆ°á»ng biá»ƒu hiá»‡n trÆ°á»›c tiÃªn á»Ÿ:", ["LÃ¡ giÃ  vÃ ng tá»« chÃ³p vÃ  mÃ©p lÃ¡ lan dáº§n", "Äá»‘m nÃ¢u trÃªn lÃ¡ non", "Thá»‘i rá»…", "Cong lÃ¡ non"], "A", "N linh Ä‘á»™ng nÃªn triá»‡u chá»©ng thiáº¿u hiá»‡n á»Ÿ lÃ¡ giÃ  trÆ°á»›c: vÃ ng Ãºa tá»« chÃ³p/mÃ©p.", 1),
        ("cn-nong", "cn-nong-giong", 11, "váº­n dá»¥ng", "tu_luan", "So sÃ¡nh Æ°u â€“ nhÆ°á»£c Ä‘iá»ƒm cá»§a nhÃ¢n giá»‘ng vÃ´ tÃ­nh (giÃ¢m, chiáº¿t, ghÃ©p) vá»›i gieo háº¡t trong sáº£n xuáº¥t cÃ¢y Äƒn quáº£. NÃªu 1 vÃ­ dá»¥ Ä‘á»™i tuyá»ƒn hay gáº·p.", "", "VÃ´ tÃ­nh: giá»¯ nguyÃªn Ä‘áº·c tÃ­nh máº¹, ra quáº£ sá»›m, Ä‘á»“ng Ä‘á»u; nhÆ°á»£c: bá»™ rá»… yáº¿u hÆ¡n, lÃ¢y bá»‡nh há»‡ thá»‘ng, thoÃ¡i hÃ³a náº¿u láº¡m dá»¥ng. VÃ­ dá»¥: ghÃ©p xoÃ i, chiáº¿t bÆ°á»Ÿi.", "Cháº¥m theo 3 Ã½: giá»¯ kiá»ƒu gen â€“ thá»i gian cho quáº£ â€“ rá»§i ro dá»‹ch bá»‡nh/bá»™ rá»…. Tá»± Ä‘á»‘i chiáº¿u.", 2),
        ("cn-nong", "cn-nong-bvtv", 12, "váº­n dá»¥ng cao", "tu_luan", "TrÃ¬nh bÃ y nguyÃªn táº¯c IPM (quáº£n lÃ½ dá»‹ch háº¡i tá»•ng há»£p) trÃªn lÃºa. Láº­p sÆ¡ Ä‘á»“ cÃ¡c biá»‡n phÃ¡p tá»« canh tÃ¡c â€“ sinh há»c â€“ hÃ³a há»c, nÃªu ngÆ°á»¡ng phÃ²ng trá»«.", "", "IPM: phÃ²ng lÃ  chÃ­nh (giá»‘ng khÃ¡ng, vá»‡ sinh Ä‘á»“ng, luÃ¢n canh), theo dÃµi báº«y + ngÆ°á»¡ng, Æ°u tiÃªn sinh há»c/tháº£o má»™c, hÃ³a há»c lÃ  cuá»‘i cÃ¹ng â€“ Ä‘Ãºng thuá»‘c, Ä‘Ãºng lÃºc, Ä‘Ãºng liá»u.", "Barem HSG: 0,5Ä‘ nguyÃªn táº¯c + 1Ä‘ nhÃ³m biá»‡n phÃ¡p + 0,5Ä‘ ngÆ°á»¡ng/vÃ­ dá»¥ (ráº§y nÃ¢u, Ä‘áº¡o Ã´n).", 3),
        ("cn-nong", "cn-nong-cncao", 12, "váº­n dá»¥ng", "trac_nghiem", "Æ¯u Ä‘iá»ƒm lá»›n nháº¥t cá»§a tÆ°á»›i nhá» giá»t káº¿t há»£p cáº£m biáº¿n áº©m trong nhÃ  mÃ ng lÃ :", ["TÄƒng cÃ´ng lao Ä‘á»™ng", "Tiáº¿t kiá»‡m nÆ°á»›c â€“ phÃ¢n, á»•n Ä‘á»‹nh áº©m vÃ¹ng rá»…", "TÄƒng cá» dáº¡i", "KhÃ´ng cáº§n Ä‘iá»‡n"], "B", "TÆ°á»›i nhá» giá»t + cáº£m biáº¿n giÃºp tiáº¿t kiá»‡m 30â€“60% nÆ°á»›c, Ä‘Æ°a phÃ¢n theo nÆ°á»›c (fertigation).", 1),
        # --- Máº«u ChÄƒn nuÃ´i ---
        ("cn-chan", "cn-chan-giong", 11, "thÃ´ng hiá»ƒu", "trac_nghiem", "Chá»‰ tiÃªu quan trá»ng nháº¥t khi chá»n lá»£n nÃ¡i háº­u bá»‹ cho Ä‘á»™i giá»‘ng lÃ :", ["MÃ u lÃ´ng Ä‘áº¹p", "Ngoáº¡i hÃ¬nh cÃ¢n Ä‘á»‘i, vÃº Ä‘á»u, lÃ½ lá»‹ch sinh sáº£n tá»‘t", "Ä‚n nhiá»u", "KÃªu to"], "B", "Chá»n theo ngoáº¡i hÃ¬nh + nÄƒng suáº¥t bá»‘ máº¹ + sá»‘ vÃº, khoáº£ng cÃ¡ch vÃº.", 1),
        ("cn-chan", "cn-chan-thucan", 11, "váº­n dá»¥ng", "trac_nghiem", "Protein thÃ´ trong kháº©u pháº§n gÃ  Ä‘áº» cáº§n cao hÆ¡n gÃ  thá»‹t giai Ä‘oáº¡n vá»— bÃ©o vÃ¬:", ["Äá»ƒ tÄƒng má»¡", "Äá»ƒ táº¡o trá»©ng (lÃ²ng tráº¯ng) vÃ  duy trÃ¬ Ä‘áº»", "Äá»ƒ giáº£m Ä‘áº»", "Äá»ƒ tÄƒng nÆ°á»›c uá»‘ng"], "B", "GÃ  Ä‘áº» cáº§n ~16â€“18% protein Ä‘á»ƒ táº¡o trá»©ng.", 1),
        ("cn-chan", "cn-chan-thuy", 12, "váº­n dá»¥ng cao", "tu_luan", "Láº­p quy trÃ¬nh an toÃ n sinh há»c (ATSH) cho tráº¡i gÃ  5000 con phÃ²ng cÃºm gia cáº§m: tá»« cá»•ng â€“ chuá»“ng â€“ con ngÆ°á»i â€“ xá»­ lÃ½ cháº¥t tháº£i.", "", "ATSH 4 lá»›p: cÃ¡ch ly (hÃ ng rÃ o, há»‘ sÃ¡t trÃ¹ng, all-in/all-out) â€“ vá»‡ sinh (phun, thay quáº§n Ã¡o) â€“ vaccine + giÃ¡m sÃ¡t â€“ xá»­ lÃ½ phÃ¢n/xÃ¡c Ä‘Ãºng (á»§, Ä‘á»‘t/chÃ´n).", "Barem: má»—i lá»›p 0,5â€“0,75Ä‘ + vÃ­ dá»¥ lá»‹ch vaccine.", 3),
        ("cn-chan", "cn-chan-chuong", 11, "váº­n dá»¥ng", "tu_luan", "NÃªu yÃªu cáº§u tiá»ƒu khÃ­ háº­u chuá»“ng bÃ² sá»¯a (nhiá»‡t Ä‘á»™, áº©m, thÃ´ng thoÃ¡ng, ná»n) vÃ  cÃ¡ch chá»‘ng nÃ³ng áº©m á»Ÿ miá»n Báº¯c.", "", "18â€“25Â°C, áº©m 60â€“75%, thoÃ¡ng, ná»n khÃ´ â€“ dá»‘c 2â€“3%. Chá»‘ng nÃ³ng: mÃ¡i cao, phun sÆ°Æ¡ng + quáº¡t, trá»“ng cÃ¢y, máº­t Ä‘á»™ há»£p lÃ½.", "Cháº¥m theo 4 yáº¿u tá»‘ + 2 giáº£i phÃ¡p chá»‘ng nÃ³ng.", 2),
        # --- Máº«u LÃ¢m nghiá»‡p â€“ Thá»§y sáº£n ---
        ("cn-lamthuy", "cn-lam-rung", 11, "thÃ´ng hiá»ƒu", "trac_nghiem", "Ká»¹ thuáº­t táº¡o cÃ¢y con báº±ng báº§u Ä‘áº¥t trong lÃ¢m nghiá»‡p nháº±m:", ["Giáº£m tá»‰ lá»‡ sá»‘ng", "Báº£o vá»‡ bá»™ rá»…, nÃ¢ng tá»‰ lá»‡ sá»‘ng khi trá»“ng rá»«ng", "TÄƒng sÃ¢u bá»‡nh", "KhÃ´ng cáº§n chÄƒm sÃ³c"], "B", "Báº§u giÃºp rá»… nguyÃªn váº¹n, cÃ¢y há»“i xanh nhanh.", 1),
        ("cn-lamthuy", "cn-lam-quanly", 12, "váº­n dá»¥ng", "tu_luan", "NÃªu vai trÃ² cá»§a rá»«ng phÃ²ng há»™ Ä‘áº§u nguá»“n vÃ  Ä‘á» xuáº¥t 3 giáº£i phÃ¡p quáº£n lÃ½ bá»n vá»¯ng á»Ÿ Ä‘á»‹a phÆ°Æ¡ng em.", "", "Cháº¯n lÅ©, giá»¯ nÆ°á»›c, chá»‘ng xÃ³i mÃ²n, Ä‘a dáº¡ng sinh há»c. Giáº£i phÃ¡p: giao Ä‘áº¥t rá»«ng + chi tráº£ DVMTR, tuáº§n tra cá»™ng Ä‘á»“ng, trá»“ng rá»«ng há»—n loÃ i.", "0,75Ä‘ vai trÃ² + 1,25Ä‘ giáº£i phÃ¡p thá»±c táº¿.", 2),
        ("cn-lamthuy", "cn-thuy-nuoi", 12, "váº­n dá»¥ng", "trac_nghiem", "Yáº¿u tá»‘ nÆ°á»›c quan trá»ng nháº¥t pháº£i kiá»ƒm tra má»—i sÃ¡ng trong ao nuÃ´i tÃ´m thÃ¢m canh lÃ :", ["MÃ u quáº§n Ã¡o cÃ´ng nhÃ¢n", "Oxy hÃ²a tan (DO), pH, NH3/khÃ­ Ä‘á»™c", "Tiáº¿ng quáº¡t", "GiÃ¡ tÃ´m"], "B", "DO sÃ¡ng sá»›m tháº¥p nháº¥t; NH3/NO2 gÃ¢y Ä‘á»™c sau cho Äƒn.", 1),
        ("cn-lamthuy", "cn-thuy-benh", 12, "váº­n dá»¥ng cao", "tu_luan", "TrÃ¬nh bÃ y quy trÃ¬nh phÃ²ng bá»‡nh tá»•ng há»£p cho cÃ¡ rÃ´ phi nuÃ´i lá»“ng: tá»« con giá»‘ng â€“ máº­t Ä‘á»™ â€“ thá»©c Äƒn â€“ xá»­ lÃ½ nÆ°á»›c â€“ vaccine/hÃ³a cháº¥t.", "", "Giá»‘ng sáº¡ch kiá»ƒm dá»‹ch â€“ máº­t Ä‘á»™ há»£p lÃ½ â€“ Äƒn Ä‘Ãºng, khÃ´ng thá»«a â€“ treo tÃºi vÃ´i/thuá»‘c Ä‘á»‹nh ká»³ â€“ táº¯m muá»‘i/KMnO4 khi váº­n chuyá»ƒn â€“ cÃ¡ch ly cÃ¡ bá»‡nh.", "Cháº¥m theo chuá»—i phÃ²ng > trá»‹; nÃªu Ä‘Æ°á»£c 5 máº¯t xÃ­ch.", 3),
    ]
    for s, t, g, d, qt, content, opts, ans, exp, score in Q:
        db.exec(
            "INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (s, t, g, d, qt, content, json.dumps(opts, ensure_ascii=False) if isinstance(opts, list) else "[]",
             ans if isinstance(ans, str) else "", exp, score, "máº«u", "", now),
        )
    print(f"[seed] loaded {len(Q)} sample questions.", flush=True)


def ensure_cn_seed(db):
    """DB cÅ© Ä‘Ã£ cÃ³ dá»¯ liá»‡u: chá»‰ bá»• sung 3 mÃ´n CN + topics, khÃ´ng xÃ³a gÃ¬.
    Chá»‰ chÃ¨n cÃ¢u há»i máº«u CN náº¿u chÆ°a cÃ³ cÃ¢u nÃ o thuá»™c 3 mÃ´n nÃ y."""
    for sid, name, code in CN_SUBJECTS:
        db.exec("INSERT OR IGNORE INTO subjects (id, name, code) VALUES (?,?,?)", (sid, name, code))
    for tid, sid, name, grade in CN_TOPICS:
        db.exec("INSERT OR IGNORE INTO topics (id, subject_id, name, grade) VALUES (?,?,?,?)", (tid, sid, name, grade))
    row = db.q1("SELECT COUNT(*) c FROM questions WHERE subject_id IN ('cn-nong','cn-chan','cn-lamthuy')")
    if row and row["c"] > 0:
        return
    now = datetime.now().isoformat(timespec="seconds")
    samples = [
        ("cn-nong", "cn-nong-dattrong", 10, "thÃ´ng hiá»ƒu", "trac_nghiem", "Keo Ä‘áº¥t cÃ³ vai trÃ² quan trá»ng nháº¥t nÃ o Ä‘á»‘i vá»›i dinh dÆ°á»¡ng cÃ¢y trá»“ng?", ["Giá»¯ nÆ°á»›c cÆ¡ há»c", "Háº¥p phá»¥ vÃ  trao Ä‘á»•i cation (CEC), giá»¯ dinh dÆ°á»¡ng", "Táº¡o mÃ u cho Ä‘áº¥t", "Diá»‡t vi sinh váº­t"], "B", "Keo Ä‘áº¥t quyáº¿t Ä‘á»‹nh kháº£ nÄƒng háº¥p phá»¥ â€“ trao Ä‘á»•i ion.", 1),
        ("cn-nong", "cn-nong-phanbon", 11, "váº­n dá»¥ng", "trac_nghiem", "Ruá»™ng lÃºa thiáº¿u Ä‘áº¡m (N) thÆ°á»ng biá»ƒu hiá»‡n trÆ°á»›c tiÃªn á»Ÿ:", ["LÃ¡ giÃ  vÃ ng tá»« chÃ³p vÃ  mÃ©p lÃ¡ lan dáº§n", "Äá»‘m nÃ¢u trÃªn lÃ¡ non", "Thá»‘i rá»…", "Cong lÃ¡ non"], "A", "N linh Ä‘á»™ng nÃªn thiáº¿u hiá»‡n á»Ÿ lÃ¡ giÃ  trÆ°á»›c.", 1),
        ("cn-nong", "cn-nong-bvtv", 12, "váº­n dá»¥ng cao", "tu_luan", "TrÃ¬nh bÃ y nguyÃªn táº¯c IPM trÃªn lÃºa vÃ  láº­p sÆ¡ Ä‘á»“ cÃ¡c biá»‡n phÃ¡p.", "", "IPM: phÃ²ng lÃ  chÃ­nh, ngÆ°á»¡ng phÃ²ng trá»«, Æ°u tiÃªn sinh há»c, hÃ³a há»c cuá»‘i cÃ¹ng.", "Barem HSG: nguyÃªn táº¯c + nhÃ³m biá»‡n phÃ¡p + ngÆ°á»¡ng.", 3),
        ("cn-chan", "cn-chan-giong", 11, "thÃ´ng hiá»ƒu", "trac_nghiem", "Chá»‰ tiÃªu quan trá»ng nháº¥t khi chá»n lá»£n nÃ¡i háº­u bá»‹ lÃ :", ["MÃ u lÃ´ng Ä‘áº¹p", "Ngoáº¡i hÃ¬nh cÃ¢n Ä‘á»‘i, vÃº Ä‘á»u, lÃ½ lá»‹ch sinh sáº£n tá»‘t", "Ä‚n nhiá»u", "KÃªu to"], "B", "Chá»n theo ngoáº¡i hÃ¬nh + nÄƒng suáº¥t bá»‘ máº¹.", 1),
        ("cn-chan", "cn-chan-thuy", 12, "váº­n dá»¥ng cao", "tu_luan", "Láº­p quy trÃ¬nh an toÃ n sinh há»c cho tráº¡i gÃ  5000 con phÃ²ng cÃºm gia cáº§m.", "", "ATSH 4 lá»›p: cÃ¡ch ly â€“ vá»‡ sinh â€“ vaccine + giÃ¡m sÃ¡t â€“ xá»­ lÃ½ cháº¥t tháº£i.", "Má»—i lá»›p 0,5â€“0,75Ä‘.", 3),
        ("cn-lamthuy", "cn-thuy-nuoi", 12, "váº­n dá»¥ng", "trac_nghiem", "Yáº¿u tá»‘ nÆ°á»›c quan trá»ng nháº¥t pháº£i kiá»ƒm tra má»—i sÃ¡ng trong ao tÃ´m thÃ¢m canh lÃ :", ["MÃ u quáº§n Ã¡o cÃ´ng nhÃ¢n", "Oxy hÃ²a tan (DO), pH, NH3/khÃ­ Ä‘á»™c", "Tiáº¿ng quáº¡t", "GiÃ¡ tÃ´m"], "B", "DO sÃ¡ng sá»›m tháº¥p nháº¥t; NH3 gÃ¢y Ä‘á»™c.", 1),
        ("cn-lamthuy", "cn-thuy-benh", 12, "váº­n dá»¥ng cao", "tu_luan", "TrÃ¬nh bÃ y quy trÃ¬nh phÃ²ng bá»‡nh tá»•ng há»£p cho cÃ¡ rÃ´ phi nuÃ´i lá»“ng.", "", "Giá»‘ng sáº¡ch â€“ máº­t Ä‘á»™ há»£p lÃ½ â€“ Äƒn Ä‘Ãºng â€“ xá»­ lÃ½ nÆ°á»›c â€“ cÃ¡ch ly cÃ¡ bá»‡nh.", "Cháº¥m theo chuá»—i phÃ²ng > trá»‹.", 3),
    ]
    for s, t, g, d, qt, content, opts, ans, exp, score in samples:
        db.exec(
            "INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (s, t, g, d, qt, content, json.dumps(opts, ensure_ascii=False) if isinstance(opts, list) else "[]",
             ans if isinstance(ans, str) else "", exp, score, "máº«u-cn", "", now),
        )
    print(f"[seed] added {len(samples)} CN sample questions to existing DB.", flush=True)
