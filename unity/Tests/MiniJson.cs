using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace StarfallKnights.Tests
{
    /// <summary>
    /// 极简只读 JSON 解析器(零第三方依赖,避免给 Unity 侧引入 NuGet)。
    /// 只为 parity 测试读取 web/src/data/*.json 使用:
    /// object→Dictionary&lt;string,object&gt;, array→List&lt;object&gt;, number→double, string→string,
    /// true/false→bool, null→null。
    /// </summary>
    public static class MiniJson
    {
        public static object Parse(string text)
        {
            int i = 0;
            var v = ParseValue(text, ref i);
            SkipWs(text, ref i);
            return v;
        }

        private static object ParseValue(string s, ref int i)
        {
            SkipWs(s, ref i);
            if (i >= s.Length) throw new FormatException("JSON 意外结束");
            char c = s[i];
            switch (c)
            {
                case '{': return ParseObject(s, ref i);
                case '[': return ParseArray(s, ref i);
                case '"': return ParseString(s, ref i);
                case 't': Expect(s, ref i, "true"); return true;
                case 'f': Expect(s, ref i, "false"); return false;
                case 'n': Expect(s, ref i, "null"); return null;
                default: return ParseNumber(s, ref i);
            }
        }

        private static Dictionary<string, object> ParseObject(string s, ref int i)
        {
            var d = new Dictionary<string, object>();
            i++; // {
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return d; }
            while (true)
            {
                SkipWs(s, ref i);
                string key = ParseString(s, ref i);
                SkipWs(s, ref i);
                if (s[i] != ':') throw new FormatException($"缺少 ':' (位置 {i})");
                i++;
                d[key] = ParseValue(s, ref i);
                SkipWs(s, ref i);
                if (i >= s.Length) throw new FormatException("对象未闭合");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == '}') { i++; return d; }
                throw new FormatException($"对象中出现意外字符 '{s[i]}' (位置 {i})");
            }
        }

        private static List<object> ParseArray(string s, ref int i)
        {
            var list = new List<object>();
            i++; // [
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return list; }
            while (true)
            {
                list.Add(ParseValue(s, ref i));
                SkipWs(s, ref i);
                if (i >= s.Length) throw new FormatException("数组未闭合");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == ']') { i++; return list; }
                throw new FormatException($"数组中出现意外字符 '{s[i]}' (位置 {i})");
            }
        }

        private static string ParseString(string s, ref int i)
        {
            if (s[i] != '"') throw new FormatException($"期望字符串(位置 {i})");
            i++;
            var sb = new StringBuilder();
            while (i < s.Length)
            {
                char c = s[i++];
                if (c == '"') return sb.ToString();
                if (c != '\\') { sb.Append(c); continue; }
                if (i >= s.Length) break;
                char e = s[i++];
                switch (e)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16));
                        i += 4;
                        break;
                    default: sb.Append(e); break;
                }
            }
            throw new FormatException("字符串未闭合");
        }

        private static object ParseNumber(string s, ref int i)
        {
            int start = i;
            while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '-' || s[i] == '+' || s[i] == '.' ||
                                    s[i] == 'e' || s[i] == 'E'))
                i++;
            string raw = s.Substring(start, i - start);
            if (raw.Length == 0) throw new FormatException($"期望数字(位置 {start})");
            return double.Parse(raw, CultureInfo.InvariantCulture);
        }

        private static void Expect(string s, ref int i, string word)
        {
            if (i + word.Length > s.Length || s.Substring(i, word.Length) != word)
                throw new FormatException($"期望 {word}(位置 {i})");
            i += word.Length;
        }

        private static void SkipWs(string s, ref int i)
        {
            while (i < s.Length && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) i++;
        }

        // ---- 便捷取值 ----

        public static Dictionary<string, object> Obj(object v) => (Dictionary<string, object>)v;
        public static List<object> Arr(object v) => (List<object>)v;

        public static Dictionary<string, object> Opt(Dictionary<string, object> d, string key)
            => d.TryGetValue(key, out var v) && v is Dictionary<string, object> dd ? dd : null;

        public static List<object> OptArr(Dictionary<string, object> d, string key)
            => d.TryGetValue(key, out var v) && v is List<object> aa ? aa : null;

        public static string Str(Dictionary<string, object> d, string key)
            => d.TryGetValue(key, out var v) ? v as string : null;

        public static double Num(Dictionary<string, object> d, string key, double fallback = double.NaN)
            => d.TryGetValue(key, out var v) && v is double dd ? dd : fallback;
    }
}
