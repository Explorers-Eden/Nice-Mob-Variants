##remove leashed companions right before the trader despawns (DespawnDelay 0 = never despawns)
execute store result score #despawn_delay nice_mob_variants.technical run data get entity @s DespawnDelay
execute if score #despawn_delay nice_mob_variants.technical matches 1..40 run function nice_mob_variants:wandering/despawn_companions with entity @s