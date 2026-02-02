// scripts/fetch-youtube-trending.js
// YouTube APIからトレンド動画とコメントを取得して記事化

const { createClient } = require('@supabase/supabase-js');

// 環境変数
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Supabaseクライアント初期化
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// YouTube API: トレンド動画検索
async function searchTrendingVideos(keyword, maxResults = 5) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&order=viewCount&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`YouTube API Error: ${data.error.message}`);
    }
    
    return data.items || [];
  } catch (error) {
    console.error('Error searching videos:', error);
    return [];
  }
}

// YouTube API: 動画のコメント取得
async function getVideoComments(videoId, maxResults = 20) {
  const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&key=${YOUTUBE_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.log(`Cannot get comments for ${videoId}: ${data.error.message}`);
      return [];
    }
    
    return data.items || [];
  } catch (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
}

// 記事を生成してSupabaseに保存
async function createArticleFromVideo(video, comments, category) {
  const snippet = video.snippet;
  const videoId = video.id.videoId;
  
  // タイトル生成
  const title = `【話題】${snippet.title}`;
  
  // コメントを整形
  let commentText = '';
  if (comments.length > 0) {
    commentText = '\n\n## 視聴者の反応\n\n';
    comments.slice(0, 10).forEach((comment, index) => {
      const text = comment.snippet.topLevelComment.snippet.textDisplay;
      const author = comment.snippet.topLevelComment.snippet.authorDisplayName;
      commentText += `**${author}**: ${text}\n\n`;
    });
  } else {
    commentText = '\n\n視聴者のコメントはまだありません。';
  }
  
  // 記事本文生成
  const content = `YouTubeで話題の動画「${snippet.title}」が注目を集めています。\n\n${snippet.description.substring(0, 200)}...\n${commentText}\n\n動画リンク: https://www.youtube.com/watch?v=${videoId}`;
  
  // 記事データ
  const articleData = {
    title: title,
    content: content,
    excerpt: snippet.description.substring(0, 150) || '話題の動画をチェック!',
    category: category,
    source_url: `https://www.youtube.com/watch?v=${videoId}`,
    image_url: snippet.thumbnails.high?.url || snippet.thumbnails.default?.url,
    is_trending: true,
    is_fire: comments.length > 50, // コメント多数なら炎上扱い
    reaction_count: Math.floor(Math.random() * 1000) + 500, // ダミー
    comment_count: comments.length,
    view_count: Math.floor(Math.random() * 10000) + 1000, // ダミー
    published_at: new Date().toISOString()
  };
  
  // Supabaseに保存
  const { data, error } = await supabase
    .from('articles')
    .insert([articleData])
    .select();
  
  if (error) {
    console.error('Error saving article:', error);
    return null;
  }
  
  console.log(`✅ Article created: ${title}`);
  return data[0];
}

// メイン処理
async function main() {
  console.log('🚀 Starting YouTube trending article generator...');
  
  // 検索キーワード
  const keywords = [
    { keyword: 'アニメ 話題', category: 'anime' },
    { keyword: 'ゲーム 実況', category: 'game' },
    { keyword: 'ボカロ 新曲', category: 'music' }
  ];
  
  let totalArticles = 0;
  
  for (const { keyword, category } of keywords) {
    console.log(`\n📺 Searching: ${keyword}`);
    
    // トレンド動画検索
    const videos = await searchTrendingVideos(keyword, 3);
    console.log(`Found ${videos.length} videos`);
    
    for (const video of videos) {
      const videoId = video.id.videoId;
      const title = video.snippet.title;
      
      console.log(`\n  Processing: ${title}`);
      
      // コメント取得
      const comments = await getVideoComments(videoId, 20);
      console.log(`  - Comments: ${comments.length}`);
      
      // 記事生成
      const article = await createArticleFromVideo(video, comments, category);
      
      if (article) {
        totalArticles++;
      }
      
      // API制限を考慮して少し待つ
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`\n✨ Completed! Created ${totalArticles} articles.`);
}

// 実行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
