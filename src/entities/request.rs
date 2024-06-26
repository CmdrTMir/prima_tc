//! `SeaORM` Entity. Generated by sea-orm-codegen 0.12.14

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
#[sea_orm(table_name = "request")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub tour: i32,
    pub customer: i32,
    pub passengers: i32,
    pub wheelchairs: i32,
    pub luggage: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::event::Entity")]
    Event,
    #[sea_orm(
        belongs_to = "super::tour::Entity",
        from = "Column::Tour",
        to = "super::tour::Column::Id",
        on_update = "NoAction",
        on_delete = "NoAction"
    )]
    Tour,
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::Customer",
        to = "super::user::Column::Id",
        on_update = "NoAction",
        on_delete = "NoAction"
    )]
    User,
}

impl Related<super::event::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Event.def()
    }
}

impl Related<super::tour::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Tour.def()
    }
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
