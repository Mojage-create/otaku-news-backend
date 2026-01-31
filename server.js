// backend/server.js
// オタクニュースアプリ - バックエンドAPI

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Supabaseクライアント初期化
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ミドルウェア
app.use(cors());
app.use(express.json());

// ==========================================
// 記事関連API
// ==========================================

// 記事一覧取得 (カテゴリフィルタ付き)
app.get('/api/articles', async (req, res) => {
  try {
    const { category, limit = 20, offset = 0 } = req.query;
    
    let query = supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// トレンド記事取得
app.get('/api/articles/trending', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('is_trending', true)
      .order('reaction_count', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching trending articles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 記事詳細取得 (反応付き)
app.get('/api/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 記事本体取得
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('*')
      .eq('id', id)
      .single();
    
    if (articleError) throw articleError;
    
    // 反応取得
    const { data: reactions, error: reactionsError } = await supabase
      .from('reactions')
      .select('*')
      .eq('article_id', id)
      .order('created_at', { ascending: false });
    
    if (reactionsError) throw reactionsError;
    
    // コメント取得
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select('*')
      .eq('article_id', id)
      .order('created_at', { ascending: false });
    
    if (commentsError) throw commentsError;
    
    // 閲覧数カウントアップ
    await supabase
      .from('articles')
      .update({ view_count: article.view_count + 1 })
      .eq('id', id);
    
    res.json({
      success: true,
      data: {
        ...article,
        reactions,
        comments
      }
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// コメント関連API
// ==========================================

// コメント投稿
app.post('/api/comments', async (req, res) => {
  try {
    const { article_id, user_name, user_avatar, text } = req.body;
    
    if (!article_id || !text) {
      return res.status(400).json({
        success: false,
        error: 'article_id and text are required'
      });
    }
    
    const { data, error } = await supabase
      .from('comments')
      .insert([
        {
          article_id,
          user_name: user_name || '匿名',
          user_avatar: user_avatar || '😊',
          text
        }
      ])
      .select();
    
    if (error) throw error;
    
    // 記事のコメント数を更新
    const { data: article } = await supabase
      .from('articles')
      .select('comment_count')
      .eq('id', article_id)
      .single();
    
    await supabase
      .from('articles')
      .update({ comment_count: (article?.comment_count || 0) + 1 })
      .eq('id', article_id);
    
    res.json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error posting comment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// タグ関連API
// ==========================================

// トレンドタグ取得
app.get('/api/tags/trending', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('is_trending', true)
      .order('count', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching trending tags:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 推薦関連API
// ==========================================

// ユーザー属性に基づく記事推薦
app.post('/api/recommendations/articles', async (req, res) => {
  try {
    const { user_id, categories, viewed_articles = [] } = req.body;
    
    let query = supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(10);
    
    // カテゴリフィルタ
    if (categories && categories.length > 0) {
      query = query.in('category', categories);
    }
    
    // 既読記事を除外 (Supabaseでは配列フィルタが制限的なので、クライアント側でフィルタ)
    const { data, error } = await query;
    
    if (error) throw error;
    
    // 既読記事を除外
    const filteredData = data.filter(
      article => !viewed_articles.includes(article.id)
    );
    
    res.json({ success: true, data: filteredData });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ユーザー属性に基づく商品推薦
app.post('/api/recommendations/products', async (req, res) => {
  try {
    const { categories } = req.body;
    
    let query = supabase
      .from('products')
      .select('*')
      .limit(5);
    
    if (categories && categories.length > 0) {
      query = query.in('category', categories);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting product recommendations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ユーザー属性管理API
// ==========================================

// ユーザー属性取得
app.get('/api/user-preferences/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user_id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    
    res.json({ success: true, data: data || null });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ユーザー属性更新
app.post('/api/user-preferences', async (req, res) => {
  try {
    const { user_id, favorite_categories, viewed_articles } = req.body;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required'
      });
    }
    
    // 既存データ確認
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user_id)
      .single();
    
    let result;
    
    if (existing) {
      // 更新
      const { data, error } = await supabase
        .from('user_preferences')
        .update({
          favorite_categories: favorite_categories || existing.favorite_categories,
          viewed_articles: viewed_articles || existing.viewed_articles,
          last_visit: new Date().toISOString()
        })
        .eq('user_id', user_id)
        .select();
      
      if (error) throw error;
      result = data[0];
    } else {
      // 新規作成
      const { data, error } = await supabase
        .from('user_preferences')
        .insert([
          {
            user_id,
            favorite_categories: favorite_categories || [],
            viewed_articles: viewed_articles || []
          }
        ])
        .select();
      
      if (error) throw error;
      result = data[0];
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 統計API
// ==========================================

// カテゴリ別記事数
app.get('/api/stats/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('category')
      .order('category');
    
    if (error) throw error;
    
    // カテゴリごとにカウント
    const stats = data.reduce((acc, { category }) => {
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching category stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ヘルスチェック
// ==========================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 API Documentation: http://localhost:${PORT}/health`);
});

module.exports = app;
