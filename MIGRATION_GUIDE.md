# Firebase to API Routes Migration Guide

This guide explains how to update components from using Firebase directly to using the new API routes and hooks.

## ✅ What's Been Completed

### Infrastructure
- ✅ Firebase Admin SDK setup (`/src/lib/firebase-admin.ts`)
- ✅ Authentication utilities (`/src/lib/auth-utils.ts`)
- ✅ All API routes created in `/src/app/api/`:
  - Posts (with full CRUD)
  - Projects (with full CRUD)
  - Technologies
  - Contact
  - Profile
  - Tasks
  - Images/Storage
  - Jobs
  - Education
- ✅ API service functions (`/src/lib/api/`) - Following couples-questions pattern
- ✅ React hooks for data fetching (`/src/hooks/`)

### Updated Components
- ✅ `src/components/contact/Contact.tsx`
- ✅ `src/components/resume/ResumeAnimation.tsx`

## 📋 Remaining Components to Update

The following components still need to be updated:

1. `src/components/editProject/ProjectEditor.tsx`
2. `src/components/editPost/PostEditor.tsx`
3. `src/components/technology/TechnologiesSelector.tsx`
4. `src/page/blog/PostPage.tsx`
5. `src/components/portfolio/PortfolioAnimation.tsx`
6. `src/components/url/UrlListEditor.tsx`
7. `src/components/image/ImapgeMultipleUpload.tsx`
8. `src/components/image/ImageUpload.tsx`
9. `src/page/editProject/EditProjectPage.tsx`
10. `src/page/editPost/EditPostPage.tsx`
11. `src/page/blog/CategoryPostPage.tsx`
12. `src/components/blog/BlogAnimation.tsx`
13. `src/components/slider/SliderAnimation.tsx`
14. `src/providers/AuthProvider.tsx`

## 🔄 Migration Patterns

### Pattern 1: Simple Data Fetching

**Before:**
```typescript
import * as postApi from '@/lib/firebase/post';

const MyComponent = () => {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    const fetchPosts = async () => {
      const data = await postApi.getPosts('technology', true, 1, 10);
      setPosts(data);
    };
    fetchPosts();
  }, []);

  return <div>{/* render posts */}</div>;
};
```

**After:**
```typescript
import { usePosts } from '@/hooks';

const MyComponent = () => {
  const { posts, loading, error } = usePosts({
    category: 'technology',
    isPublic: true,
    page: 1,
    limit: 10,
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{/* render posts */}</div>;
};
```

### Pattern 2: Mutations (Create/Update/Delete)

**Before:**
```typescript
import * as postApi from '@/lib/firebase/post';

const MyComponent = () => {
  const handleCreate = async (data) => {
    try {
      const id = await postApi.createPost(data);
      toast.success('Created successfully!');
    } catch (error) {
      toast.error('Failed to create');
    }
  };

  return <button onClick={handleCreate}>Create</button>;
};
```

**After:**
```typescript
import { usePostMutations } from '@/hooks';

const MyComponent = () => {
  const { createPost, loading } = usePostMutations();

  const handleCreate = async (data) => {
    try {
      const id = await createPost(data);
      toast.success('Created successfully!');
    } catch (error) {
      toast.error('Failed to create');
    }
  };

  return (
    <button onClick={handleCreate} disabled={loading}>
      {loading ? 'Creating...' : 'Create'}
    </button>
  );
};
```

### Pattern 3: Image Upload

**Before:**
```typescript
import * as imageApi from '@/lib/firebase/image';

const MyComponent = () => {
  const handleUpload = async (file: File) => {
    const url = await imageApi.getMenuImageRef(file);
    console.log('Uploaded:', url);
  };

  return <input type="file" onChange={(e) => handleUpload(e.target.files[0])} />;
};
```

**After:**
```typescript
import { useImageUpload } from '@/hooks';

const MyComponent = () => {
  const { uploadMenuImage, loading, uploadProgress } = useImageUpload();

  const handleUpload = async (file: File) => {
    const url = await uploadMenuImage(file);
    console.log('Uploaded:', url);
  };

  return (
    <>
      <input
        type="file"
        onChange={(e) => handleUpload(e.target.files[0])}
        disabled={loading}
      />
      {loading && <progress value={uploadProgress} max={100} />}
    </>
  );
};
```

### Pattern 4: Complex Components with Multiple Operations

**Before:**
```typescript
import * as postApi from '@/lib/firebase/post';
import * as imageApi from '@/lib/firebase/image';

const PostEditor = () => {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadPost = async (id, category) => {
    const data = await postApi.getPostByCategory(id, category);
    setPost(data);
  };

  const savePost = async (data) => {
    setLoading(true);
    try {
      await postApi.updatePost(data);
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (file) => {
    const url = await imageApi.getMenuImageRef(file);
    return url;
  };

  return <div>{/* editor UI */}</div>;
};
```

**After:**
```typescript
import { usePost, usePostMutations, useImageUpload } from '@/hooks';

const PostEditor = ({ id, category }) => {
  const { post, loading: loadingPost } = usePost(id, category);
  const { updatePost, loading: saving } = usePostMutations();
  const { uploadMenuImage, loading: uploading } = useImageUpload();

  const handleSave = async (data) => {
    await updatePost(id, category, data);
  };

  const handleImageUpload = async (file) => {
    const url = await uploadMenuImage(file);
    return url;
  };

  if (loadingPost) return <div>Loading...</div>;

  return <div>{/* editor UI */}</div>;
};
```

## 🎯 Available Hooks

### Posts
```typescript
import {
  usePosts,           // Fetch paginated posts
  usePostsByCategory, // Fetch posts by category
  usePost,            // Fetch single post
  usePostCategories,  // Fetch categories
  useTopPosts,        // Fetch top 4 posts
  usePostMutations,   // Create/Update/Delete
} from '@/hooks';
```

### Projects
```typescript
import {
  useProjects,         // Fetch all projects
  useProject,          // Fetch single project
  useProjectCategories,// Fetch categories
  useUrlTypes,         // Fetch URL types
  useProjectMutations, // Create/Update/Delete
} from '@/hooks';
```

### Technologies
```typescript
import {
  useTechnologies,     // Fetch all technologies
  useTechnologyNames,  // Fetch technology names
} from '@/hooks';
```

### Contact
```typescript
import {
  useContacts,         // Fetch all contacts (auth required)
  useContactMutations, // Create contact
} from '@/hooks';
```

### Resume/Jobs/Education
```typescript
import {
  useJobs,      // Fetch all jobs
  useEducation, // Fetch all education
} from '@/hooks';
```

### Profile
```typescript
import {
  useResumeLink, // Fetch resume link
} from '@/hooks';
```

### Tasks
```typescript
import {
  useTasks,         // Fetch tasks for user
  useTaskMutations, // Update task completion
} from '@/hooks';
```

### Images
```typescript
import {
  useImageUpload, // Upload images
} from '@/hooks';

// Methods:
// - uploadMenuImage(file)
// - uploadImage(file, type, id)
```

## 🔧 Direct API Service Usage

If you need more control or don't want to use hooks, you can use the API services directly:

```typescript
import * as postsApi from '@/lib/api/posts';
import * as projectsApi from '@/lib/api/projects';

// In an async function or event handler:
const { posts } = await postsApi.getPosts({ category: 'technology' });
const post = await postsApi.getPostByCategory('id', 'category');
const id = await postsApi.createPost({ title: 'New Post', ... });
await postsApi.updatePost('id', 'category', { title: 'Updated' });
await postsApi.deletePostByCategory('id', 'category');
```

## 🚀 Quick Start for Updating a Component

1. **Identify Firebase imports:**
   ```typescript
   import * as postApi from '@/lib/firebase/post';
   import * as imageApi from '@/lib/firebase/image';
   ```

2. **Replace with hook imports:**
   ```typescript
   import { usePosts, usePostMutations, useImageUpload } from '@/hooks';
   ```

3. **Replace useState + useEffect with hooks:**
   ```typescript
   // Before:
   const [posts, setPosts] = useState([]);
   useEffect(() => {
     postApi.getPosts(...).then(setPosts);
   }, []);

   // After:
   const { posts, loading, error } = usePosts({ ... });
   ```

4. **Replace API calls with hook methods:**
   ```typescript
   // Before:
   await postApi.createPost(data);

   // After:
   const { createPost } = usePostMutations();
   await createPost(data);
   ```

5. **Add loading states to UI:**
   ```typescript
   <Button disabled={loading}>
     {loading ? 'Saving...' : 'Save'}
   </Button>
   ```

## 📝 Example: Full Component Migration

See `src/components/contact/Contact.tsx` and `src/components/resume/ResumeAnimation.tsx` for complete examples of migrated components.

## ⚙️ Environment Variables

Make sure to set up your Firebase Admin credentials:

```env
# .env.local
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
NEXT_PUBLIC_PROJECT_ID=your-project-id
NEXT_PUBLIC_STORAGE_BUCKET=your-bucket-name
```

## 🔐 Authentication

All authenticated requests automatically include the Firebase ID token from the current user. The API routes verify this token using Firebase Admin SDK before processing requests.

No changes needed in components for authentication - it's handled automatically by the hooks and API client!

## 📚 Additional Resources

- API Routes: `/src/app/api/`
- Hooks: `/src/hooks/`
- API Services: `/src/lib/api/`
- Auth Utilities: `/src/lib/auth-utils.ts`

## 🐛 Troubleshooting

### "Not authenticated" errors
- Ensure the user is logged in via Firebase Auth
- Check that the Firebase ID token is being sent correctly

### Type errors
- All hooks return typed data - check the TypeScript definitions in `/src/lib/api/`

### API not found (404)
- Verify the API route exists in `/src/app/api/`
- Check the endpoint path in network tab

Need help? Check the console for detailed error messages from the API client.
