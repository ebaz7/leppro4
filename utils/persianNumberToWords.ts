/**
 * Converts numbers into Persian words (e.g., for Rial and Toman cheque amounts)
 */

export function digitToPersianWords(num: number | string): string {
    if (!num || isNaN(Number(num)) || Number(num) === 0) return 'صفر';
    const cleanNum = Math.floor(Math.abs(Number(num)));
    if (cleanNum === 0) return 'صفر';

    const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
    const dahha = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
    const dahToNozdah = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
    const sadha = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
    const scale = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

    function getChunk(n: number): string {
        let s = '';
        const c = Math.floor(n / 100);
        const rem = n % 100;
        const d = Math.floor(rem / 10);
        const y = rem % 10;

        if (c > 0) s += sadha[c];
        if (rem >= 10 && rem <= 19) {
            if (s) s += ' و ';
            s += dahToNozdah[rem - 10];
        } else {
            if (d > 1) {
                if (s) s += ' و ';
                s += dahha[d];
            }
            if (y > 0) {
                if (s) s += ' و ';
                s += yekan[y];
            }
        }
        return s;
    }

    const chunks: number[] = [];
    let temp = cleanNum;
    while (temp > 0) {
        chunks.push(temp % 1000);
        temp = Math.floor(temp / 1000);
    }

    const result: string[] = [];
    for (let i = chunks.length - 1; i >= 0; i--) {
        const c = chunks[i];
        if (c > 0) {
            const word = getChunk(c);
            const sc = scale[i];
            result.push(sc ? `${word} ${sc}` : word);
        }
    }

    return result.join(' و ');
}

export function formatChequeAmountInWords(amountRial: number | string): {
    rialWords: string;
    tomanWords: string;
    rialFormatted: string;
    tomanFormatted: string;
} {
    const numRial = Math.floor(Number(amountRial) || 0);
    const numToman = Math.floor(numRial / 10);

    const rialWords = numRial > 0 ? `${digitToPersianWords(numRial)} ریال تمام` : 'صفر ریال';
    const tomanWords = numToman > 0 ? `${digitToPersianWords(numToman)} تومان` : 'صفر تومان';

    return {
        rialWords,
        tomanWords,
        rialFormatted: numRial.toLocaleString('fa-IR'),
        tomanFormatted: numToman.toLocaleString('fa-IR')
    };
}
