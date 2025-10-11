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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          email: string | null
          external_erp_id: string | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          postal_code: string | null
          region: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          external_erp_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          external_erp_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          arrival_time: string | null
          created_at: string
          delivered_quantity: number | null
          delivery_proof_url: string | null
          departure_time: string | null
          driver_id: string | null
          gps_tracking: Json | null
          id: string
          notes: string | null
          order_id: string
          signature_url: string | null
          status: string
          tenant_id: string
          updated_at: string
          vehicle_number: string | null
        }
        Insert: {
          arrival_time?: string | null
          created_at?: string
          delivered_quantity?: number | null
          delivery_proof_url?: string | null
          departure_time?: string | null
          driver_id?: string | null
          gps_tracking?: Json | null
          id?: string
          notes?: string | null
          order_id: string
          signature_url?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          vehicle_number?: string | null
        }
        Update: {
          arrival_time?: string | null
          created_at?: string
          delivered_quantity?: number | null
          delivery_proof_url?: string | null
          departure_time?: string | null
          driver_id?: string | null
          gps_tracking?: Json | null
          id?: string
          notes?: string | null
          order_id?: string
          signature_url?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          created_at: string
          id: string
          last_updated_by: string | null
          location: string
          max_capacity: number | null
          min_threshold: number | null
          product_type: string
          quantity: number
          tenant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_updated_by?: string | null
          location: string
          max_capacity?: number | null
          min_threshold?: number | null
          product_type: string
          quantity?: number
          tenant_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_updated_by?: string | null
          location?: string
          max_capacity?: number | null
          min_threshold?: number | null
          product_type?: string
          quantity?: number
          tenant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string | null
          due_date: string | null
          external_erp_id: string | null
          id: string
          invoice_number: string
          order_id: string
          paid_date: string | null
          payment_method: string | null
          status: string
          tax_amount: number | null
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string | null
          due_date?: string | null
          external_erp_id?: string | null
          id?: string
          invoice_number: string
          order_id: string
          paid_date?: string | null
          payment_method?: string | null
          status?: string
          tax_amount?: number | null
          tenant_id: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string | null
          due_date?: string | null
          external_erp_id?: string | null
          id?: string
          invoice_number?: string
          order_id?: string
          paid_date?: string | null
          payment_method?: string | null
          status?: string
          tax_amount?: number | null
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivery_address: string
          delivery_city: string | null
          delivery_region: string | null
          external_erp_id: string | null
          id: string
          notes: string | null
          order_number: string
          priority: string | null
          product_type: string
          quantity: number
          requested_delivery_date: string | null
          status: string
          tenant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivery_address: string
          delivery_city?: string | null
          delivery_region?: string | null
          external_erp_id?: string | null
          id?: string
          notes?: string | null
          order_number: string
          priority?: string | null
          product_type: string
          quantity: number
          requested_delivery_date?: string | null
          status?: string
          tenant_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivery_address?: string
          delivery_city?: string | null
          delivery_region?: string | null
          external_erp_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          priority?: string | null
          product_type?: string
          quantity?: number
          requested_delivery_date?: string | null
          status?: string
          tenant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          client_id: string | null
          client_secret_encrypted: string | null
          created_at: string | null
          gateway_type: string
          id: string
          is_active: boolean | null
          is_sandbox: boolean | null
          public_key: string | null
          secret_key_encrypted: string | null
          tenant_id: string
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          client_id?: string | null
          client_secret_encrypted?: string | null
          created_at?: string | null
          gateway_type: string
          id?: string
          is_active?: boolean | null
          is_sandbox?: boolean | null
          public_key?: string | null
          secret_key_encrypted?: string | null
          tenant_id: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          client_id?: string | null
          client_secret_encrypted?: string | null
          created_at?: string | null
          gateway_type?: string
          id?: string
          is_active?: boolean | null
          is_sandbox?: boolean | null
          public_key?: string | null
          secret_key_encrypted?: string | null
          tenant_id?: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateways_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          gateway_response: Json | null
          gateway_type: string
          id: string
          invoice_id: string | null
          paid_at: string | null
          status: string | null
          subscription_id: string | null
          tenant_id: string
          transaction_reference: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          gateway_response?: Json | null
          gateway_type: string
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          status?: string | null
          subscription_id?: string | null
          tenant_id: string
          transaction_reference: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          gateway_response?: Json | null
          gateway_type?: string
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          status?: string | null
          subscription_id?: string | null
          tenant_id?: string
          transaction_reference?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          max_monthly_transactions: number
          max_trucks: number
          max_users: number
          name: string
          price_annual: number
          price_monthly: number
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_monthly_transactions?: number
          max_trucks?: number
          max_users?: number
          name: string
          price_annual: number
          price_monthly: number
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_monthly_transactions?: number
          max_trucks?: number
          max_users?: number
          name?: string
          price_annual?: number
          price_monthly?: number
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string | null
        }
        Relationships: []
      }
      tenant_subscriptions: {
        Row: {
          billing_cycle: string
          cancelled_at: string | null
          created_at: string | null
          current_period_end: string
          current_period_start: string
          id: string
          plan_id: string
          status: string
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          billing_cycle?: string
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end: string
          current_period_start: string
          id?: string
          plan_id: string
          status?: string
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_cycle?: string
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id?: string
          status?: string
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          contact_email: string
          created_at: string
          erp_config: Json | null
          erp_sandbox_mode: boolean | null
          erp_system: Database["public"]["Enums"]["erp_system"] | null
          id: string
          industry: string | null
          is_active: boolean | null
          logo_url: string | null
          name: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          primary_color: string | null
          secondary_color: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          contact_email: string
          created_at?: string
          erp_config?: Json | null
          erp_sandbox_mode?: boolean | null
          erp_system?: Database["public"]["Enums"]["erp_system"] | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          contact_email?: string
          created_at?: string
          erp_config?: Json | null
          erp_sandbox_mode?: boolean | null
          erp_system?: Database["public"]["Enums"]["erp_system"] | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      trucks: {
        Row: {
          capacity: number
          capacity_unit: string | null
          created_at: string | null
          driver_id: string | null
          gps_device_id: string | null
          id: string
          last_location: Json | null
          plate_number: string
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          capacity: number
          capacity_unit?: string | null
          created_at?: string | null
          driver_id?: string | null
          gps_device_id?: string | null
          id?: string
          last_location?: Json | null
          plate_number: string
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          capacity?: number
          capacity_unit?: string | null
          created_at?: string | null
          driver_id?: string | null
          gps_device_id?: string | null
          id?: string
          last_location?: Json | null
          plate_number?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trucks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_audit_log: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_new_values?: Json
          p_old_values?: Json
        }
        Returns: string
      }
      get_user_tenant_id: {
        Args: { _user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: {
        Args: { _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "tenant_admin"
        | "dispatch_officer"
        | "driver"
        | "user"
        | "sales_manager"
        | "sales_rep"
      erp_system: "sap" | "oracle" | "odoo" | "dynamics" | "mock"
      subscription_plan: "free" | "pro" | "enterprise"
      subscription_tier: "starter" | "business" | "enterprise"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: [
        "super_admin",
        "tenant_admin",
        "dispatch_officer",
        "driver",
        "user",
        "sales_manager",
        "sales_rep",
      ],
      erp_system: ["sap", "oracle", "odoo", "dynamics", "mock"],
      subscription_plan: ["free", "pro", "enterprise"],
      subscription_tier: ["starter", "business", "enterprise"],
    },
  },
} as const
