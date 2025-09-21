import sys
import json
import time
import os
from openai import OpenAI

# Bagian prompt tetap (You are... + KEY RULES + GLOSSARY)
base_prompt = """You are an expert game localization translator specializing in medieval kingdom and colony management games like Norland. Your task is to translate English text from the game into natural, immersive Indonesian, while maintaining the game's tone: feudal, strategic, and immersive with elements of resource management, nobility, and historical fantasy.

KEY RULES:
1. **Consistency**: Always use the exact translations from the glossary bellow. Do not vary them under any circumstances. If a term isn't in the glossary, translate it naturally but consistently across all outputs.
2. **Context Awareness**: Adapt translations to the medieval/colonial context. Make it sound like formal, archaic Indonesian where appropriate (e.g., for nobility dialogues), but keep it readable and engaging for players. Avoid modern slang.
3. **Preserve Original Terms**: If a term has no direct, natural Indonesian equivalent or feels forced (e.g., unique game mechanics like resource names), keep it in English (italicized or in quotes) and add a brief explanatory phrase only if it enhances clarity without breaking immersion. Do not force awkward translations.
4. **Natural Flow**: Ensure translations are idiomatic Indonesian. Read the full text for context before translating. Preserve humor, tension, or strategy nuances.
5. **Input/Output Structure**: The input will be a JSON array , each containing metadata (e.g., tags like <hint> or <b>). Translate only the English text into Indonesian, leaving all other structure, metadata, tags (< >), and order unchanged. Output must be a valid JSON array in the exact same format and sequence as input—do not add, remove, or reorder elements. For example, if input has <noble_title>, keep it as-is in output.

GLOSSARY :
- obsessions: obsesi
- dreams: mimpi
- Inspiration: Inspirasi
- unhappy: tidak bahagia
- Spear: Tombak
- Day Patrols: Patroli Siang
- Meat: Daging
- Holy Rings: Cincin Suci
- Bishop: Uskup
- title: gelar
- Intelligence: Kecerdasan
- battle squad: regu pertempuran
- fleshwolf: Fleshwolf
- social thought: pemikiran sosial
- Combat skill: Keterampilan Tempur
- Command skill: Keterampilan Komando
- deep conversations: percakapan mendalam
- mood: suasana hati
- Manners: Etika
- care: perawatan
- marriage: pernikahan
- knowledge: pengetahuan
- talent: bakat
- Training: Pelatihan
- desire: keinginan
- enemy: musuh
- Persuasion: Persuasi
- interest: minat
- puppet: boneka
- relationship: hubungan
- kings: raja-raja
- Poisoner: Pengracun
- loyalty: kesetiaan
- hostage: sandera
- Diplomat: Diplomat
- rebellion: pemberontakan
- sins: dosa
- Fanatics: Fanatik
- blessing: berkah
- Matriarch's opinion: Pendapat Matriark
- bastard child: anak haram
- sexual needs: kebutuhan seksual
- peasant: petani
- criminals: penjahat
- executioners: algojo
- terror: teror
- Scaffold: Panggung Gantung
- punishment: hukuman
- vagabond: pengembara
- forest bandits: perampok hutan
- cutthroats: pembunuh berantai
- blind: buta
- prisoner: Narapidana
- Management: Manajemen
- Chancellery: Kanselari
- Precise Language: Bahasa yang Tepat
- rest: istirahat
- skill: keterampilan
- Temples: Kuil
- agnostics: agnostik
- doctrine: doktrin
- morning prayer: doa pagi
- Paper: Kertas
- book: buku
- lords: para penguasa
- Gold: Emas
- builders: tukang bangunan
- servants: pelayan
- loyalists: loyalis
- Hall: Aula
- guests: tamu
- archer guards: Garda Pemanah
- warriors: prajurit
- instructions: instruksi
- alcohol: alkohol
- Economics menu: Menu Ekonomi
- Nectar: Nektar
- resource storage: penyimpanan sumber daya
- weddings: pernikahan
- funerals: pemakaman
- sermons: khotbah
- Medical Salve: Salep Medis
- Tools: Alat
- Daggers: Belati
- Bows: Busur
- Crossbows: Busur Silang
- Wood: Kayu
- Shields: Perisai
- Light Armor: Baju Zirah Ringan
- Heavy Armor: Baju Zirah Berat
- Maces: Gada
- Axes: Kapak
- Swords: Pedang
- Coal: Batu Bara
- Iron: Besi
- Steel: Baja
- Rye: Rye
- Hops: Hop
- Rutabagas: Rutabaga
- Flour: Tepung
- Herbs: Rempah
- thought: pikiran
- lice: kutu
- foul plague: wabah busuk
- Soap: Sabun
- crimes: kejahatan
- Heartfelt Communication: Komunikasi Ikhlas
- Insult: Penghinaan
- Joke: Lelucon
- Mockery: Ejekan
- Ignoring: Mengabaikan
- Small Talk: Obrolan Ringan
- Flattery: Sanjungan
- Apology: Permintaan Maaf
- friends: teman
- deadly enemies: musuh bebuyutan
- romantic: romantis
- kinship: kerabat
- illness: penyakit
- date: kencan
- intrigues: intrik
- Flirts: Rayuan
- Feels jealous: Merasa Cemburu
- in love: jatuh cinta
- bribing: suap
- death: kematian
- Kaiden: jawa
- Tanaya: madura
- Varn: sunda
- Makha: dayak
- the Church: Pihak Gereja
- Loving Family: Keluarga Penuh Kasih
- lesser lord: penguasa rendahan
- religious uprising: pemberontakan agama
- needs: kebutuhan
- happy: bahagia
- migration: migrasi
- Peasants: Petani
- Prisoners: Tahanan
- Statistics menu: Menu Statistik
- insight: wawasan
- wealth: kekayaan
- Markets: Pasar
- Taverns: Kedai
- Holy Caravan: Karavan Suci
- Library: Perpustakaan
- executed: dieksekusi
- Crimson Empire: Kekaisaran Crimson
- knights: ksatria
- Flavorful Ale: Flavorful Ale
- bravery: keberanian
- uprising: pemberontakan
- priest: pendeta
- injuries: luka
- Rutabaga poisoning: Keracunan Rutabaga
- treated: dirawat
- pain: sakit
- bleeding: pendarahan
- inflammation: peradangan
- gangrene: Luka Busuk
- pain threshold: ambang batas rasa sakit
- syphilis: sifilis
- pale rabies: rabies pucat
- Bath: Mandi
- Dead God: Dead God
- Cainism: Kainisme
- prophet Michael: nabi Michael
- New Kingdoms: Kerajaan Baru
- noble : bangsawan
- Great Purification: Pembersihan Agung
- Great Cycle: Siklus Besar
- Inquisition: Inkuisisi
- Matriarch Jadwiga: Matriark Jadwiga
- marauders: Begal
- nervous breakdown: penyakit mental
- virtues: kebajikan
- canon: kanon
- sermon: khotbah
- piety: kesalehan
- praying: berdoa
- confession: pengakuan dosa
- Mitraya: Mitraya
- Wise Conversation: Percakapan Bijak
- hunger: lapar
- Moonshine: Moonshine
- Beer: Bir
- hangover: mabuk berat
- Brewery: Pabrik Bir
- soil fertility: kesuburan tanah
- Lumbermill: Penggergajian Kayu
- Coal Furnace: Tungku Batu Bara
- Mines: Tambang
- Smelting Furnace: Tungku Peleburan
- food: makanan
- Mill: Penggilingan
- Rye Field: Ladang Rye
- Hop Fields: Ladang Hop
- Rutabaga Fields: Ladang Rutabaga
- Pig Farms: Peternakan Babi
- herbalists: ahli rempah
- Alchemy Lab: Laboratorium Alkimia
- psychoactive effect: efek psikoaktif
- Drug Dens: Sarang Narkoba
- Workshop: Bengkel
- Paper Workshop: Bengkel Kertas
- Armor Forge: Tempa Zirah
- dazing: membingungkan
- Weapon Forge: Tempa Senjata
- Prison Wards: Blok Penjara
- wages: upah
- Patrol Banners: Bendera Patroli
- Training Ground: Lapangan Latihan
- mercenaries: tentara bayaran
- Warehouse: Gudang
- reward: hadiah
- threaten: mengancam
- inquisitors: inkuisitor
- learning: belajar
- dark deeds: perbuatan gelap
- Trade: Perdagangan
- Altars: Altar
- Intimidated: Terintimidasi
- equipment: peralatan
- Incapacitated: Tidak Mampu
- bribes: suap
- seduction: godaan
- Unholy Horde: Unholy Horde
- Forecaster: Peramal
- private housing: perumahan pribadi
- Terrorizing: Mengterrorisasi
- Barracks: Barak
- hunts: berburu
- Doubt: Keraguan
- Faith: Iman
- tasks: tugas
- Resources produced: Sumber Daya Diproduksi
- Goods sold: Barang Dijual
- increased: meningkat
- surprise attacks: serangan mendadak
- Strength: Kekuatan
- Military: Militer
- Peace: Perdamaian
- Nature: Alam
- Poison Secrets: Rahasia Racun
- Church curse: Kutukan Gereja
- elderly: lansia
- local demand: lokal demand
- their values: nilai-nilai mereka
- speculators: speculators
- unhappiness: ketidakbahagiaan
- Production menu: Menu Produksi
- duel: duel
- take action: bertindak
- recovery: pemulihan
- inflamed wound: luka meradang
- painful shock: syok menyakitkan
- learns: belajar
- rewrites: tulis ulang
- sleep: tidur
- scar: bekas luka
- effect: efek
- Inherited: Diwarisi
- baldness: kebotakan
- childhood: masa kecil
- direct management: manajemen langsung
- housing: perumahan
- Friendship: Persahabatan:
- Neutrality: Netralitas
- Hostility: Permusuhan
- Enmity: Kebencian
- saturate: jenuh
- Speech fatigue: Kelelahan Bicara
- Inspection fatigue: Kelelahan Inspeksi
- Study fatigue: Kelelahan Belajar
- Work fatigue: Kelelahan Kerja
- Alcoholism: Alkoholisme
- Gambling addiction: Kecanduan Judi
- donate: menyumbang
- Dynasty menu: Menu Dinasti
- prestige: presti
- Pacifist: Pasifis
- blinded: dibutakan
- messenger: utusan
- It's possible: Mungkin
- Most likely: Paling Mungkin
- weak: lemah
- suzerain: suzerain
- trade agreement: perjanjian perdagangan
- ally: sekutu
- internal trade: perdagangan internal
- massacre: pembantaian
- depleting: habis
- free lord: penguasa bebas
- crown: mahkota
- goddess Dahamat: dewi Dahamat
- defence tower: menara pertahanan
- scholar: sarjana
- protection: perlindungan
- Archer Tower: Menara Pemanah
- Workplaces: Tempat Kerja
- Scriptonics: Scriptonics
- monogamous: monogami
- indebted: berutang
- military uprising: pemberontakan militer
- loyalty sermons: khotbah kesetiaan
- army’s loyalty: kesetiaan pasukan
- followers: pengikut
- politician: politisi

TEXT TO TRANSLATE :
"""

def translate_file(file_path):
    """Fungsi untuk menerjemahkan satu file JSON"""
    # Baca file JSON
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            texts = json.load(f)
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.")
        return False
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in '{file_path}': {e}")
        return False

    # Bangun array string untuk prompt
    texts_str = ',\n  '.join(f'"{text.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')}"' for text in texts)
    full_prompt = f"{base_prompt}[\n  {texts_str}\n]"

    # Setup client OpenRouter
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key="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",  # Ganti dengan API key kamu jika perlu
    )

    # Kirim request
    try:
        completion = client.chat.completions.create(
            model="x-ai/grok-4-fast:free",  # Pilih model lain sesuai kebutuhan
            messages=[
                {
                    "role": "user",
                    "content": full_prompt
                }
            ]
        )
        response_content = completion.choices[0].message.content.strip()

        # Parse response sebagai JSON array
        translated_texts = json.loads(response_content)

        # Validasi: panjang harus sama
        if len(translated_texts) != len(texts):
            print(f"Error: Response length mismatch for '{file_path}'. Expected {len(texts)}, got {len(translated_texts)}")
            return False

        # Overwrite file jika sukses
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(translated_texts, f, indent=2, ensure_ascii=False)
        print(f"Translation successful! File '{file_path}' has been updated.")
        return True

    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in API response for '{file_path}': {e}")
        print("Response content:", response_content[:500])  # Print sebagian untuk debug
        return False
    except Exception as e:
        print(f"Error during API call for '{file_path}': {e}")
        return False

# Cek argumen command line
if len(sys.argv) != 2:
    print("Usage:")
    print("  python translate.py <file.json>          # Translate single file")
    print("  python translate.py trans-all            # Translate all JSON files in 'trans_all' folder")
    sys.exit(1)

arg = sys.argv[1]

if arg == "trans-all":
    folder = "trans_all"
    # Buat folder jika belum ada
    if not os.path.exists(folder):
        os.makedirs(folder)
        print(f"Folder '{folder}' created.")
    else:
        # Ambil semua file .json di folder
        json_files = [f for f in os.listdir(folder) if f.endswith('.json')]
        if not json_files:
            print(f"No JSON files found in '{folder}'.")
            sys.exit(0)
        
        print(f"Found {len(json_files)} JSON files in '{folder}'. Starting translation with 30s delay between files...")
        
        success_count = 0
        failed_files = []
        
        for i, file_name in enumerate(json_files, 1):
            file_path = os.path.join(folder, file_name)
            print(f"\n--- Processing file {i}/{len(json_files)}: {file_name} ---")
            success = translate_file(file_path)
            if success:
                success_count += 1
            else:
                failed_files.append(file_name)
            if success and i < len(json_files):
                print("Waiting 5 seconds before next file...")
                time.sleep(5)
        
        # Summary di akhir
        print("\n" + "="*50)
        print("TRANSLATION SUMMARY:")
        print(f"Total files: {len(json_files)}")
        print(f"Successful: {success_count}")
        print(f"Failed: {len(failed_files)}")
        if failed_files:
            print("Failed files:")
            for f in failed_files:
                print(f"  - {f}")
        else:
            print("All files translated successfully!")
        print("="*50)
        
else:
    # Single file mode
    file_path = arg
    print(f"Translating single file: {file_path}")
    translate_file(file_path)