export type UserRole = "cliente" | "transportador" | "planta" | "admin";
export type ResidueType = "concreto" | "ladrillo" | "mixto" | "madera" | "drywall" | "metal" | "otros";
export type VolumeSize = "pequeno" | "mediano" | "grande";
export type ServiceStatus =
  | "pendiente"
  | "asignado"
  | "aceptado"
  | "en camino"
  | "cargando"
  | "cargado"
  | "en transito"
  | "planta"
  | "retrasado"
  | "recibido"
  | "recibido en planta"
  | "pesado"
  | "procesado"
  | "certificado"
  | "certificado generado"
  | "finalizado";
export type PhotoKind = "residuo" | "antes" | "despues" | "cargue" | "bascula" | "manifiesto" | "certificado";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          role: UserRole;
          full_name: string;
          phone: string | null;
          company_name: string | null;
          document_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          full_name: string;
          phone?: string | null;
          company_name?: string | null;
          document_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      projects: {
        Row: {
          id: string;
          client_id: string;
          name: string;
          address: string;
          city: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          name: string;
          address: string;
          city?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
      };
      pickup_requests: {
        Row: {
          id: string;
          client_id: string;
          project_id: string;
          plant_id: string | null;
          residue_type: ResidueType;
          volume_size: VolumeSize;
          scheduled_at: string;
          status: ServiceStatus;
          address: string;
          price_cents: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          project_id: string;
          plant_id?: string | null;
          residue_type: ResidueType;
          volume_size: VolumeSize;
          scheduled_at: string;
          status?: ServiceStatus;
          address: string;
          price_cents?: number;
        };
        Update: Partial<Database["public"]["Tables"]["pickup_requests"]["Insert"]>;
      };
      residue_passports: {
        Row: {
          id: string;
          pickup_request_id: string;
          unique_id: string;
          qr_code: string;
          timestamps: Json;
          geo_locations: Json;
          final_weight_kg: number | null;
          certificate_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["residue_passports"]["Row"]> & {
          pickup_request_id: string;
          unique_id: string;
          qr_code: string;
        };
        Update: Partial<Database["public"]["Tables"]["residue_passports"]["Insert"]>;
      };
      tracking_events: {
        Row: {
          id: string;
          pickup_request_id: string;
          user_id: string;
          event_name: string;
          status: ServiceStatus | null;
          latitude: number | null;
          longitude: number | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          pickup_request_id: string;
          user_id: string;
          event_name: string;
          status?: ServiceStatus | null;
          latitude?: number | null;
          longitude?: number | null;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["tracking_events"]["Insert"]>;
      };
      plants: {
        Row: {
          id: string;
          owner_id: string | null;
          name: string;
          authorization_code: string;
          address: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          name: string;
          authorization_code: string;
          address: string;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["plants"]["Insert"]>;
      };
      vehicles: {
        Row: {
          id: string;
          transporter_id: string;
          plate: string;
          capacity_tons: number;
          vehicle_type: string;
          documents: Json;
          active: boolean;
        };
        Insert: {
          id?: string;
          transporter_id: string;
          plate: string;
          capacity_tons: number;
          vehicle_type: string;
          documents?: Json;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["vehicles"]["Insert"]>;
      };
      photos: {
        Row: {
          id: string;
          pickup_request_id: string;
          uploaded_by: string;
          kind: PhotoKind;
          storage_path: string;
          latitude: number | null;
          longitude: number | null;
          taken_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pickup_request_id: string;
          uploaded_by: string;
          kind: PhotoKind;
          storage_path: string;
          latitude?: number | null;
          longitude?: number | null;
          taken_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["photos"]["Insert"]>;
      };
      certificates: {
        Row: {
          id: string;
          pickup_request_id: string;
          storage_path: string;
          public_url: string | null;
          verification_hash: string;
          generated_at: string;
        };
        Insert: {
          id?: string;
          pickup_request_id: string;
          storage_path: string;
          public_url?: string | null;
          verification_hash: string;
        };
        Update: Partial<Database["public"]["Tables"]["certificates"]["Insert"]>;
      };
      file_objects: {
        Row: {
          key: string;
          content_type: string;
          data_base64: string;
          size_bytes: number;
          created_at: string;
        };
        Insert: {
          key: string;
          content_type: string;
          data_base64: string;
          size_bytes: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["file_objects"]["Insert"]>;
      };
      security_logs: {
        Row: {
          id: string;
          type: string;
          severity: string;
          user_id: string | null;
          user_role: UserRole | null;
          ip: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          severity?: string;
          user_id?: string | null;
          user_role?: UserRole | null;
          ip?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["security_logs"]["Insert"]>;
      };
      weight_tickets: {
        Row: {
          id: string;
          pickup_request_id: string;
          plant_id: string;
          gross_weight_kg: number;
          tare_weight_kg: number;
          net_weight_kg: number;
          material_classification: ResidueType;
          disposition: string;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
      };
      transport_assignments: {
        Row: {
          id: string;
          pickup_request_id: string;
          transporter_id: string;
          vehicle_id: string | null;
          driver_id: string | null;
          accepted_at: string | null;
          rejected_at: string | null;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
      };
    };
    Views: {
      analytics: {
        Row: {
          services: number;
          collected_kg: number;
          revenue_cents: number;
          recurring_clients: number;
          avg_collection_hours: number | null;
        };
      };
    };
    Functions: {
      create_pickup_with_passport: {
        Args: { request_payload: Json };
        Returns: Database["public"]["Tables"]["pickup_requests"]["Row"];
      };
      record_tracking_event: {
        Args: {
          target_pickup_request_id: string;
          next_status: ServiceStatus | null;
          event_label: string;
          lat: number | null;
          lng: number | null;
          event_metadata: Json;
        };
        Returns: Database["public"]["Tables"]["tracking_events"]["Row"];
      };
    };
  };
};
