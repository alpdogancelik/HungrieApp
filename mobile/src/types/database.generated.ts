export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          block: string | null
          city: string
          country: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          line1: string
          profile_id: string
          room: string | null
          updated_at: string
        }
        Insert: {
          block?: string | null
          city: string
          country: string
          created_at?: string
          id: string
          is_default?: boolean
          label: string
          line1: string
          profile_id: string
          room?: string | null
          updated_at?: string
        }
        Update: {
          block?: string | null
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          line1?: string
          profile_id?: string
          room?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          icon?: string | null
          id: string
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          profile_id: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          calories: number | null
          category_id: string
          cost_kurus: number | null
          created_at: string
          customizations: Json
          description: string
          eta_minutes: number | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price_kurus: number
          protein_grams: number | null
          rating_average: number
          rating_count: number
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          calories?: number | null
          category_id: string
          cost_kurus?: number | null
          created_at?: string
          customizations?: Json
          description?: string
          eta_minutes?: number | null
          id: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price_kurus: number
          protein_grams?: number | null
          rating_average?: number
          rating_count?: number
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          calories?: number | null
          category_id?: string
          cost_kurus?: number | null
          created_at?: string
          customizations?: Json
          description?: string
          eta_minutes?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price_kurus?: number
          protein_grams?: number | null
          rating_average?: number
          rating_count?: number
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_restaurant_id_fkey"
            columns: ["category_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_categories"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "menu_items_category_id_restaurant_id_fkey"
            columns: ["category_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          customization_total_kurus: number
          customizations_snapshot: Json
          id: string
          image_url_snapshot: string | null
          menu_item_id: string | null
          name_snapshot: string
          order_id: string
          quantity: number
          unit_price_kurus: number
        }
        Insert: {
          created_at?: string
          customization_total_kurus?: number
          customizations_snapshot?: Json
          id: string
          image_url_snapshot?: string | null
          menu_item_id?: string | null
          name_snapshot: string
          order_id: string
          quantity: number
          unit_price_kurus: number
        }
        Update: {
          created_at?: string
          customization_total_kurus?: number
          customizations_snapshot?: Json
          id?: string
          image_url_snapshot?: string | null
          menu_item_id?: string | null
          name_snapshot?: string
          order_id?: string
          quantity?: number
          unit_price_kurus?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "active_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "courier_assigned_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "courier_available_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "my_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_reviews: {
        Row: {
          average_rating: number | null
          comment: string
          created_at: string
          id: string
          items_snapshot: Json
          order_id: string
          price_performance_rating: number | null
          profile_id: string
          restaurant_id: string
          restaurant_name_snapshot: string
          review_key: string
          speed_rating: number
          status: Database["public"]["Enums"]["review_status"]
          taste_rating: number
          updated_at: string
          user_name_snapshot: string
          value_rating: number
        }
        Insert: {
          average_rating?: number | null
          comment?: string
          created_at?: string
          id: string
          items_snapshot?: Json
          order_id: string
          price_performance_rating?: number | null
          profile_id: string
          restaurant_id: string
          restaurant_name_snapshot: string
          review_key: string
          speed_rating: number
          status?: Database["public"]["Enums"]["review_status"]
          taste_rating: number
          updated_at?: string
          user_name_snapshot: string
          value_rating: number
        }
        Update: {
          average_rating?: number | null
          comment?: string
          created_at?: string
          id?: string
          items_snapshot?: Json
          order_id?: string
          price_performance_rating?: number | null
          profile_id?: string
          restaurant_id?: string
          restaurant_name_snapshot?: string
          review_key?: string
          speed_rating?: number
          status?: Database["public"]["Enums"]["review_status"]
          taste_rating?: number
          updated_at?: string
          user_name_snapshot?: string
          value_rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_reviews_order_id_restaurant_id_profile_id_fkey"
            columns: ["order_id", "restaurant_id", "profile_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "restaurant_id", "profile_id"]
          },
        ]
      }
      orders: {
        Row: {
          approval_deadline_at: string | null
          canceled_at: string | null
          courier_profile_id: string | null
          created_at: string
          delivered_at: string | null
          delivery_fee_kurus: number
          discount_kurus: number
          eta_minutes: number | null
          id: string
          notes: string
          out_for_delivery_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          preparing_at: string | null
          profile_id: string
          ready_at: string | null
          reminder_pending: boolean
          reminder_requested_at: string | null
          reminder_requested_by: string | null
          reminder_source: string | null
          restaurant_id: string
          service_fee_kurus: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal_kurus: number
          tip_kurus: number
          total_kurus: number
          updated_at: string
        }
        Insert: {
          approval_deadline_at?: string | null
          canceled_at?: string | null
          courier_profile_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_fee_kurus?: number
          discount_kurus?: number
          eta_minutes?: number | null
          id: string
          notes?: string
          out_for_delivery_at?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          preparing_at?: string | null
          profile_id: string
          ready_at?: string | null
          reminder_pending?: boolean
          reminder_requested_at?: string | null
          reminder_requested_by?: string | null
          reminder_source?: string | null
          restaurant_id: string
          service_fee_kurus?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_kurus: number
          tip_kurus?: number
          total_kurus: number
          updated_at?: string
        }
        Update: {
          approval_deadline_at?: string | null
          canceled_at?: string | null
          courier_profile_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_fee_kurus?: number
          discount_kurus?: number
          eta_minutes?: number | null
          id?: string
          notes?: string
          out_for_delivery_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          preparing_at?: string | null
          profile_id?: string
          ready_at?: string | null
          reminder_pending?: boolean
          reminder_requested_at?: string | null
          reminder_requested_by?: string | null
          reminder_source?: string | null
          restaurant_id?: string
          service_fee_kurus?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_kurus?: number
          tip_kurus?: number
          total_kurus?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_courier_profile_id_fkey"
            columns: ["courier_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reminder_requested_by_fkey"
            columns: ["reminder_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string
          created_at: string
          id: string
          menu_item_id: string
          menu_item_name_snapshot: string
          order_id: string
          profile_id: string
          rating: number
          replied_at: string | null
          reply: string | null
          restaurant_id: string
          review_key: string
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
          user_name_snapshot: string
        }
        Insert: {
          comment?: string
          created_at?: string
          id: string
          menu_item_id: string
          menu_item_name_snapshot: string
          order_id: string
          profile_id: string
          rating: number
          replied_at?: string | null
          reply?: string | null
          restaurant_id: string
          review_key: string
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          user_name_snapshot: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          menu_item_id?: string
          menu_item_name_snapshot?: string
          order_id?: string
          profile_id?: string
          rating?: number
          replied_at?: string | null
          reply?: string | null
          restaurant_id?: string
          review_key?: string
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          user_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_menu_item_id_restaurant_id_fkey"
            columns: ["menu_item_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_menu_items"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "product_reviews_menu_item_id_restaurant_id_fkey"
            columns: ["menu_item_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "product_reviews_order_id_restaurant_id_profile_id_fkey"
            columns: ["order_id", "restaurant_id", "profile_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "restaurant_id", "profile_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          firebase_uid: string | null
          id: string
          name: string
          preferred_language: string
          supabase_user_id: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          firebase_uid?: string | null
          id: string
          name: string
          preferred_language?: string
          supabase_user_id?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          firebase_uid?: string | null
          id?: string
          name?: string
          preferred_language?: string
          supabase_user_id?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          address: string
          created_at: string
          cuisine: string
          delivery_eta_max_minutes: number | null
          delivery_eta_min_minutes: number | null
          delivery_fee_kurus: number
          description: string
          id: string
          image_url: string | null
          is_active: boolean
          minimum_order_kurus: number
          name: string
          opening_hours: Json
          phone: string | null
          preferred_language: string
          rating_average: number
          rating_count: number
          updated_at: string
        }
        Insert: {
          address?: string
          created_at?: string
          cuisine?: string
          delivery_eta_max_minutes?: number | null
          delivery_eta_min_minutes?: number | null
          delivery_fee_kurus?: number
          description?: string
          id: string
          image_url?: string | null
          is_active?: boolean
          minimum_order_kurus?: number
          name: string
          opening_hours?: Json
          phone?: string | null
          preferred_language?: string
          rating_average?: number
          rating_count?: number
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          cuisine?: string
          delivery_eta_max_minutes?: number | null
          delivery_eta_min_minutes?: number | null
          delivery_fee_kurus?: number
          description?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          minimum_order_kurus?: number
          name?: string
          opening_hours?: Json
          phone?: string | null
          preferred_language?: string
          rating_average?: number
          rating_count?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      active_categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string | null
          name: string | null
          restaurant_id: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      active_menu_items: {
        Row: {
          calories: number | null
          category_id: string | null
          created_at: string | null
          customizations: Json | null
          description: string | null
          eta_minutes: number | null
          id: string | null
          image_url: string | null
          name: string | null
          price_kurus: number | null
          protein_grams: number | null
          rating_average: number | null
          rating_count: number | null
          restaurant_id: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_restaurant_id_fkey"
            columns: ["category_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_categories"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "menu_items_category_id_restaurant_id_fkey"
            columns: ["category_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      active_restaurants: {
        Row: {
          created_at: string | null
          cuisine: string | null
          delivery_eta_max_minutes: number | null
          delivery_eta_min_minutes: number | null
          delivery_fee_kurus: number | null
          description: string | null
          id: string | null
          image_url: string | null
          minimum_order_kurus: number | null
          name: string | null
          opening_hours: Json | null
          preferred_language: string | null
          rating_average: number | null
          rating_count: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cuisine?: string | null
          delivery_eta_max_minutes?: number | null
          delivery_eta_min_minutes?: number | null
          delivery_fee_kurus?: number | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          minimum_order_kurus?: number | null
          name?: string | null
          opening_hours?: Json | null
          preferred_language?: string | null
          rating_average?: number | null
          rating_count?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cuisine?: string | null
          delivery_eta_max_minutes?: number | null
          delivery_eta_min_minutes?: number | null
          delivery_fee_kurus?: number | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          minimum_order_kurus?: number | null
          name?: string | null
          opening_hours?: Json | null
          preferred_language?: string | null
          rating_average?: number | null
          rating_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_orders: {
        Row: {
          approval_deadline_at: string | null
          canceled_at: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          delivery_address_snapshot: Json | null
          delivery_fee_kurus: number | null
          discount_kurus: number | null
          eta_minutes: number | null
          id: string | null
          out_for_delivery_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          preparing_at: string | null
          ready_at: string | null
          reminder_pending: boolean | null
          reminder_requested_at: string | null
          restaurant_id: string | null
          service_fee_kurus: number | null
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus: number | null
          tip_kurus: number | null
          total_kurus: number | null
          updated_at: string | null
        }
        Insert: {
          approval_deadline_at?: string | null
          canceled_at?: string | null
          created_at?: string | null
          customer_email?: never
          customer_name?: never
          customer_whatsapp?: never
          delivered_at?: string | null
          delivery_address_snapshot?: never
          delivery_fee_kurus?: number | null
          discount_kurus?: number | null
          eta_minutes?: number | null
          id?: string | null
          out_for_delivery_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          preparing_at?: string | null
          ready_at?: string | null
          reminder_pending?: boolean | null
          reminder_requested_at?: string | null
          restaurant_id?: string | null
          service_fee_kurus?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus?: number | null
          tip_kurus?: number | null
          total_kurus?: number | null
          updated_at?: string | null
        }
        Update: {
          approval_deadline_at?: string | null
          canceled_at?: string | null
          created_at?: string | null
          customer_email?: never
          customer_name?: never
          customer_whatsapp?: never
          delivered_at?: string | null
          delivery_address_snapshot?: never
          delivery_fee_kurus?: number | null
          discount_kurus?: number | null
          eta_minutes?: number | null
          id?: string | null
          out_for_delivery_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          preparing_at?: string | null
          ready_at?: string | null
          reminder_pending?: boolean | null
          reminder_requested_at?: string | null
          restaurant_id?: string | null
          service_fee_kurus?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus?: number | null
          tip_kurus?: number | null
          total_kurus?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_assigned_orders: {
        Row: {
          approval_deadline_at: string | null
          canceled_at: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          delivery_address_snapshot: Json | null
          delivery_fee_kurus: number | null
          discount_kurus: number | null
          eta_minutes: number | null
          id: string | null
          out_for_delivery_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          preparing_at: string | null
          ready_at: string | null
          reminder_pending: boolean | null
          reminder_requested_at: string | null
          restaurant_id: string | null
          service_fee_kurus: number | null
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus: number | null
          tip_kurus: number | null
          total_kurus: number | null
          updated_at: string | null
        }
        Insert: {
          approval_deadline_at?: string | null
          canceled_at?: string | null
          created_at?: string | null
          customer_email?: never
          customer_name?: never
          customer_whatsapp?: never
          delivered_at?: string | null
          delivery_address_snapshot?: never
          delivery_fee_kurus?: number | null
          discount_kurus?: number | null
          eta_minutes?: number | null
          id?: string | null
          out_for_delivery_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          preparing_at?: string | null
          ready_at?: string | null
          reminder_pending?: boolean | null
          reminder_requested_at?: string | null
          restaurant_id?: string | null
          service_fee_kurus?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus?: number | null
          tip_kurus?: number | null
          total_kurus?: number | null
          updated_at?: string | null
        }
        Update: {
          approval_deadline_at?: string | null
          canceled_at?: string | null
          created_at?: string | null
          customer_email?: never
          customer_name?: never
          customer_whatsapp?: never
          delivered_at?: string | null
          delivery_address_snapshot?: never
          delivery_fee_kurus?: number | null
          discount_kurus?: number | null
          eta_minutes?: number | null
          id?: string | null
          out_for_delivery_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          preparing_at?: string | null
          ready_at?: string | null
          reminder_pending?: boolean | null
          reminder_requested_at?: string | null
          restaurant_id?: string | null
          service_fee_kurus?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus?: number | null
          tip_kurus?: number | null
          total_kurus?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_available_orders: {
        Row: {
          created_at: string | null
          eta_minutes: number | null
          id: string | null
          restaurant_id: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          eta_minutes?: number | null
          id?: string | null
          restaurant_id?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          eta_minutes?: number | null
          id?: string | null
          restaurant_id?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      my_orders: {
        Row: {
          approval_deadline_at: string | null
          canceled_at: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          delivery_address_snapshot: Json | null
          delivery_fee_kurus: number | null
          discount_kurus: number | null
          eta_minutes: number | null
          id: string | null
          out_for_delivery_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          preparing_at: string | null
          ready_at: string | null
          reminder_pending: boolean | null
          reminder_requested_at: string | null
          restaurant_id: string | null
          service_fee_kurus: number | null
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus: number | null
          tip_kurus: number | null
          total_kurus: number | null
          updated_at: string | null
        }
        Insert: {
          approval_deadline_at?: string | null
          canceled_at?: string | null
          created_at?: string | null
          customer_email?: never
          customer_name?: never
          customer_whatsapp?: never
          delivered_at?: string | null
          delivery_address_snapshot?: never
          delivery_fee_kurus?: number | null
          discount_kurus?: number | null
          eta_minutes?: number | null
          id?: string | null
          out_for_delivery_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          preparing_at?: string | null
          ready_at?: string | null
          reminder_pending?: boolean | null
          reminder_requested_at?: string | null
          restaurant_id?: string | null
          service_fee_kurus?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus?: number | null
          tip_kurus?: number | null
          total_kurus?: number | null
          updated_at?: string | null
        }
        Update: {
          approval_deadline_at?: string | null
          canceled_at?: string | null
          created_at?: string | null
          customer_email?: never
          customer_name?: never
          customer_whatsapp?: never
          delivered_at?: string | null
          delivery_address_snapshot?: never
          delivery_fee_kurus?: number | null
          discount_kurus?: number | null
          eta_minutes?: number | null
          id?: string | null
          out_for_delivery_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          preparing_at?: string | null
          ready_at?: string | null
          reminder_pending?: boolean | null
          reminder_requested_at?: string | null
          restaurant_id?: string | null
          service_fee_kurus?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus?: number | null
          tip_kurus?: number | null
          total_kurus?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      my_restaurant_memberships: {
        Row: {
          created_at: string | null
          restaurant_id: string | null
          role: Database["public"]["Enums"]["restaurant_role"] | null
          updated_at: string | null
        }
        Relationships: []
      }
      published_order_reviews: {
        Row: {
          average_rating: number | null
          comment: string | null
          created_at: string | null
          id: string | null
          items_snapshot: Json | null
          price_performance_rating: number | null
          restaurant_id: string | null
          restaurant_name_snapshot: string | null
          speed_rating: number | null
          taste_rating: number | null
          updated_at: string | null
          user_name_snapshot: string | null
          value_rating: number | null
        }
        Insert: {
          average_rating?: number | null
          comment?: string | null
          created_at?: string | null
          id?: string | null
          items_snapshot?: Json | null
          price_performance_rating?: number | null
          restaurant_id?: string | null
          restaurant_name_snapshot?: string | null
          speed_rating?: number | null
          taste_rating?: number | null
          updated_at?: string | null
          user_name_snapshot?: string | null
          value_rating?: number | null
        }
        Update: {
          average_rating?: number | null
          comment?: string | null
          created_at?: string | null
          id?: string | null
          items_snapshot?: Json | null
          price_performance_rating?: number | null
          restaurant_id?: string | null
          restaurant_name_snapshot?: string | null
          speed_rating?: number | null
          taste_rating?: number | null
          updated_at?: string | null
          user_name_snapshot?: string | null
          value_rating?: number | null
        }
        Relationships: []
      }
      published_product_reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string | null
          menu_item_id: string | null
          menu_item_name_snapshot: string | null
          rating: number | null
          replied_at: string | null
          reply: string | null
          restaurant_id: string | null
          updated_at: string | null
          user_name_snapshot: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string | null
          menu_item_id?: string | null
          menu_item_name_snapshot?: string | null
          rating?: number | null
          replied_at?: string | null
          reply?: string | null
          restaurant_id?: string | null
          updated_at?: string | null
          user_name_snapshot?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string | null
          menu_item_id?: string | null
          menu_item_name_snapshot?: string | null
          rating?: number | null
          replied_at?: string | null
          reply?: string | null
          restaurant_id?: string | null
          updated_at?: string | null
          user_name_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_menu_item_id_restaurant_id_fkey"
            columns: ["menu_item_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_menu_items"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "product_reviews_menu_item_id_restaurant_id_fkey"
            columns: ["menu_item_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      restaurant_orders: {
        Row: {
          approval_deadline_at: string | null
          canceled_at: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          delivery_address_snapshot: Json | null
          delivery_fee_kurus: number | null
          discount_kurus: number | null
          eta_minutes: number | null
          id: string | null
          out_for_delivery_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          preparing_at: string | null
          ready_at: string | null
          reminder_pending: boolean | null
          reminder_requested_at: string | null
          restaurant_id: string | null
          service_fee_kurus: number | null
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus: number | null
          tip_kurus: number | null
          total_kurus: number | null
          updated_at: string | null
        }
        Insert: {
          approval_deadline_at?: string | null
          canceled_at?: string | null
          created_at?: string | null
          customer_email?: never
          customer_name?: never
          customer_whatsapp?: never
          delivered_at?: string | null
          delivery_address_snapshot?: never
          delivery_fee_kurus?: number | null
          discount_kurus?: number | null
          eta_minutes?: number | null
          id?: string | null
          out_for_delivery_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          preparing_at?: string | null
          ready_at?: string | null
          reminder_pending?: boolean | null
          reminder_requested_at?: string | null
          restaurant_id?: string | null
          service_fee_kurus?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus?: number | null
          tip_kurus?: number | null
          total_kurus?: number | null
          updated_at?: string | null
        }
        Update: {
          approval_deadline_at?: string | null
          canceled_at?: string | null
          created_at?: string | null
          customer_email?: never
          customer_name?: never
          customer_whatsapp?: never
          delivered_at?: string | null
          delivery_address_snapshot?: never
          delivery_fee_kurus?: number | null
          discount_kurus?: number | null
          eta_minutes?: number | null
          id?: string | null
          out_for_delivery_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          preparing_at?: string | null
          ready_at?: string | null
          reminder_pending?: boolean | null
          reminder_requested_at?: string | null
          restaurant_id?: string | null
          service_fee_kurus?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal_kurus?: number | null
          tip_kurus?: number | null
          total_kurus?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "active_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_delivery: { Args: { p_order_id: string }; Returns: string }
      create_order: {
        Args: {
          p_address_id: string
          p_items: Json
          p_notes?: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_restaurant_id: string
        }
        Returns: string
      }
      ensure_my_profile: {
        Args: {
          p_avatar_url?: string
          p_name: string
          p_preferred_language?: string
          p_whatsapp_number?: string
        }
        Returns: string
      }
      moderate_review: {
        Args: {
          p_reply?: string
          p_review_id: string
          p_review_type: string
          p_status: Database["public"]["Enums"]["review_status"]
        }
        Returns: undefined
      }
      quote_order: {
        Args: { p_items: Json; p_restaurant_id: string }
        Returns: Json
      }
      request_order_reminder: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      set_category_active: {
        Args: { p_category_id: string; p_is_active: boolean }
        Returns: undefined
      }
      set_default_address: {
        Args: { p_address_id: string }
        Returns: undefined
      }
      set_menu_item_active: {
        Args: { p_is_active: boolean; p_menu_item_id: string }
        Returns: undefined
      }
      set_platform_role: {
        Args: {
          p_enabled: boolean
          p_profile_id: string
          p_role: Database["public"]["Enums"]["platform_role"]
        }
        Returns: undefined
      }
      set_restaurant_courier: {
        Args: {
          p_enabled: boolean
          p_profile_id: string
          p_restaurant_id: string
        }
        Returns: undefined
      }
      set_restaurant_member: {
        Args: {
          p_profile_id: string
          p_restaurant_id: string
          p_role?: Database["public"]["Enums"]["restaurant_role"]
        }
        Returns: undefined
      }
      submit_order_review: {
        Args: {
          p_comment?: string
          p_order_id: string
          p_price_performance_rating?: number
          p_speed_rating: number
          p_taste_rating: number
          p_value_rating: number
        }
        Returns: string
      }
      submit_product_review: {
        Args: {
          p_comment?: string
          p_menu_item_id: string
          p_order_id: string
          p_rating: number
        }
        Returns: string
      }
      transition_order: {
        Args: {
          p_new_status: Database["public"]["Enums"]["order_status"]
          p_order_id: string
          p_reason?: string
        }
        Returns: Database["public"]["Enums"]["order_status"]
      }
      update_restaurant_details: {
        Args: { p_changes: Json; p_restaurant_id: string }
        Returns: undefined
      }
      upsert_category: {
        Args: {
          p_category_id: string
          p_description?: string
          p_icon?: string
          p_is_active?: boolean
          p_name: string
          p_restaurant_id: string
          p_sort_order?: number
        }
        Returns: string
      }
      upsert_menu_item: {
        Args: {
          p_calories?: number
          p_category_id: string
          p_cost_kurus?: number
          p_customizations?: Json
          p_description?: string
          p_eta_minutes?: number
          p_image_url?: string
          p_is_active?: boolean
          p_menu_item_id: string
          p_name: string
          p_price_kurus: number
          p_protein_grams?: number
          p_restaurant_id: string
          p_sort_order?: number
        }
        Returns: string
      }
    }
    Enums: {
      notification_platform: "ios" | "android" | "web" | "unknown"
      notification_provider: "apns" | "fcm" | "web" | "unknown"
      order_status:
        | "pending"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "canceled"
      payment_method: "cash" | "pos"
      platform_role: "admin" | "super_admin" | "courier"
      restaurant_role: "owner" | "manager"
      review_status: "published" | "hidden"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      notification_platform: ["ios", "android", "web", "unknown"],
      notification_provider: ["apns", "fcm", "web", "unknown"],
      order_status: [
        "pending",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "canceled",
      ],
      payment_method: ["cash", "pos"],
      platform_role: ["admin", "super_admin", "courier"],
      restaurant_role: ["owner", "manager"],
      review_status: ["published", "hidden"],
    },
  },
} as const
